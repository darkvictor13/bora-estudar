-- =============================================================================
-- Bora Estudar — Schema inicial completo
-- =============================================================================
-- Cria toda a base do zero num projeto Supabase novo e vazio.
-- Idempotente no nível do arquivo: pode ser reexecutado sem erro.
-- A transação é gerenciada pelo CLI do Supabase; não há begin/commit aqui.
--
-- Ordem de execução:
--   1. extensões e utilitários
--   2. tipos enumerados
--   3. tabelas (identidade → catálogo → planejamento → execução → suporte)
--   4. views de desempenho
--   5. triggers
--   6. RLS
--   7. RPCs (única via de escrita nas tabelas transacionais)
--   8. grants
--
-- Princípios aplicados:
--   - o ledger `bateria_questoes` é a única fonte de verdade de desempenho;
--     nenhum contador agregado é mantido à mão;
--   - nada é apagado fisicamente: `excluido_em` + tabela `auditoria`;
--   - toda operação mutante é idempotente por `request_id` com hash de payload;
--   - invariantes de negócio são constraints, não sequências de UPDATE no client;
--   - nenhum dado de domínio em texto livre: tudo é coluna tipada ou FK;
--   - o contexto denormalizado (aluno_id/professor_id) é protegido por FK composta.
-- =============================================================================


-- =============================================================================
-- 1. EXTENSÕES E UTILITÁRIOS
-- =============================================================================

create extension if not exists pgcrypto with schema extensions;

-- Mantém `atualizado_em` sem depender do client.
create or replace function public.tg_atualizar_timestamp()
returns trigger
language plpgsql
as $$
begin
  new.atualizado_em := now();
  return new;
end;
$$;

comment on function public.tg_atualizar_timestamp is
  'Trigger BEFORE UPDATE: mantém atualizado_em. O client nunca escreve essa coluna.';


-- =============================================================================
-- 2. TIPOS ENUMERADOS
-- =============================================================================
-- Substituem os CHECK (col in ('a','b')) e os discriminadores que antes viviam
-- embutidos em texto livre.

do $$
begin
  if not exists (select 1 from pg_type where typname = 'papel_usuario') then
    create type public.papel_usuario as enum ('aluno','professor','admin');
  end if;
  if not exists (select 1 from pg_type where typname = 'status_acesso') then
    create type public.status_acesso as enum ('pendente','ativo','suspenso','expirado');
  end if;
  if not exists (select 1 from pg_type where typname = 'status_planejamento') then
    create type public.status_planejamento as enum ('rascunho','ativo','pausado','arquivado');
  end if;
  if not exists (select 1 from pg_type where typname = 'tipo_meta') then
    create type public.tipo_meta as enum ('teoria','bloco_questoes','reforco','estudo_extra');
  end if;
  if not exists (select 1 from pg_type where typname = 'status_meta') then
    create type public.status_meta as enum ('pendente','em_andamento','concluida','pulada','cancelada');
  end if;
  if not exists (select 1 from pg_type where typname = 'status_bateria') then
    create type public.status_bateria as enum ('em_andamento','aguardando_tempo','concluida','cancelada','anulada');
  end if;
  if not exists (select 1 from pg_type where typname = 'origem_bateria') then
    create type public.origem_bateria as enum ('meta','caderno_erros');
  end if;
  if not exists (select 1 from pg_type where typname = 'fase_questao') then
    create type public.fase_questao as enum ('principal','reforco','extra');
  end if;
  if not exists (select 1 from pg_type where typname = 'resultado_questao') then
    create type public.resultado_questao as enum ('acertou','errou');
  end if;
  if not exists (select 1 from pg_type where typname = 'modo_lote') then
    create type public.modo_lote as enum ('acrescentar','substituir','replanejar');
  end if;
end;
$$;


-- =============================================================================
-- 3. TABELAS
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 3.1 Identidade e acesso
-- -----------------------------------------------------------------------------
-- `perfis` guarda QUEM a pessoa é. `assinaturas` guarda O QUE ela contratou.
-- Manter os dois separados impede que um upsert de cadastro zere uma assinatura
-- paga — que é o que acontece quando status_acesso mora na mesma linha do nome.

create table if not exists public.perfis (
  id            uuid primary key references auth.users(id) on delete cascade,
  papel         public.papel_usuario not null default 'aluno',
  nome          text not null check (length(btrim(nome)) >= 2),
  email_contato text,
  telefone      text,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

comment on table public.perfis is 'Identidade. Espelha auth.users 1:1. Sem dados comerciais.';


create table if not exists public.cupons (
  id           uuid primary key default gen_random_uuid(),
  codigo       text not null unique,
  meses        smallint not null check (meses > 0),
  usos_maximos integer check (usos_maximos > 0),
  usos_atuais  integer not null default 0 check (usos_atuais >= 0),
  valido_ate   date,
  ativo        boolean not null default true,
  criado_em    timestamptz not null default now(),
  constraint cupom_usos_dentro_do_limite
    check (usos_maximos is null or usos_atuais <= usos_maximos)
);


-- Substitui `profiles.professor_id`. Como tabela, o vínculo tem início e fim,
-- então trocar de professor não apaga o histórico de quem acompanhou o aluno.
create table if not exists public.vinculos_aluno_professor (
  id           uuid primary key default gen_random_uuid(),
  aluno_id     uuid not null references public.perfis(id) on delete cascade,
  professor_id uuid not null references public.perfis(id) on delete restrict,
  iniciado_em  timestamptz not null default now(),
  encerrado_em timestamptz,
  criado_em    timestamptz not null default now(),
  constraint vinculo_periodo_valido  check (encerrado_em is null or encerrado_em > iniciado_em),
  constraint vinculo_nao_reflexivo   check (aluno_id <> professor_id)
);

-- Um professor vigente por aluno, garantido pelo banco.
create unique index if not exists vinculo_vigente_uidx
  on public.vinculos_aluno_professor (aluno_id)
  where encerrado_em is null;

create index if not exists vinculo_professor_idx
  on public.vinculos_aluno_professor (professor_id)
  where encerrado_em is null;


create table if not exists public.assinaturas (
  id            uuid primary key default gen_random_uuid(),
  aluno_id      uuid not null references public.perfis(id) on delete cascade,
  status        public.status_acesso not null default 'pendente',
  plano         text not null default 'teste',
  vigencia      daterange,
  cupom_id      uuid references public.cupons(id) on delete set null,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint assinatura_ativa_tem_vigencia
    check (status <> 'ativo' or vigencia is not null)
);

-- Uma assinatura ativa por aluno.
-- Nota: para impedir também SOBREPOSIÇÃO entre assinaturas históricas, troque
-- este índice por um EXCLUDE gist — requer `create extension btree_gist`:
--   alter table public.assinaturas add constraint assinatura_sem_sobreposicao
--     exclude using gist (aluno_id with =, vigencia with &&);
-- O índice parcial abaixo resolve o caso real (uma vigente por vez) sem
-- depender da extensão estar no search_path da migração.
create unique index if not exists assinatura_ativa_uidx
  on public.assinaturas (aluno_id)
  where status = 'ativo';

create index if not exists assinatura_aluno_idx on public.assinaturas (aluno_id, status);


create table if not exists public.lista_espera (
  aluno_id        uuid primary key references public.perfis(id) on delete cascade,
  professor_id    uuid references public.perfis(id) on delete set null,
  nome            text not null,
  email           text not null,
  whatsapp        text,
  area_interesse  text,
  concurso_foco   text,
  fuso_horario    text,
  data_nascimento date,
  status          text not null default 'aguardando',
  criado_em       timestamptz not null default now(),
  atualizado_em   timestamptz not null default now()
);


-- -----------------------------------------------------------------------------
-- 3.2 Catálogo de questões
-- -----------------------------------------------------------------------------
-- O mapa questão → tópico precisa ser tabela, não um JSON de 1 MB baixado a cada
-- login e cruzado em JavaScript. Como tabela, o cruzamento vira JOIN.

create table if not exists public.catalogos (
  chave     text primary key,
  nome      text not null,
  ativo     boolean not null default true,
  criado_em timestamptz not null default now()
);

create table if not exists public.catalogo_blocos (
  id               uuid primary key default gen_random_uuid(),
  catalogo_chave   text not null references public.catalogos(chave) on delete restrict,
  bloco_chave      text not null,
  numero           integer not null check (numero > 0),
  nome             text not null,
  disciplina_chave text not null,
  disciplina_nome  text not null,
  questoes_qtd     integer not null default 0 check (questoes_qtd >= 0),
  ativo            boolean not null default true,
  criado_em        timestamptz not null default now(),
  atualizado_em    timestamptz not null default now(),
  unique (catalogo_chave, bloco_chave),
  unique (catalogo_chave, disciplina_chave, numero)
);

create index if not exists catalogo_blocos_disciplina_idx
  on public.catalogo_blocos (catalogo_chave, disciplina_chave)
  where ativo;

create table if not exists public.catalogo_questoes (
  bloco_id   uuid   not null references public.catalogo_blocos(id) on delete cascade,
  questao_id bigint not null check (questao_id > 0),
  topico     text   not null,
  posicao    integer not null check (posicao > 0),
  primary key (bloco_id, questao_id),
  unique (bloco_id, posicao)
);

-- Suporta "de que tópico é a questão N", usado na reconstrução do resumo.
create index if not exists catalogo_questoes_questao_idx
  on public.catalogo_questoes (questao_id);


-- -----------------------------------------------------------------------------
-- 3.3 Planejamento
-- -----------------------------------------------------------------------------

create table if not exists public.planejamentos (
  id             uuid primary key default gen_random_uuid(),
  aluno_id       uuid not null references public.perfis(id) on delete restrict,
  professor_id   uuid not null references public.perfis(id) on delete restrict,
  nome           text not null check (length(btrim(nome)) > 0),
  area           text,
  concurso_alvo  text,
  fase           text,
  modelo_estudo  text,
  metas_semanais integer not null default 24 check (metas_semanais between 1 and 200),
  data_inicio    date not null default current_date,
  status         public.status_planejamento not null default 'rascunho',
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now(),
  excluido_em    timestamptz,

  constraint planejamento_nao_reflexivo check (aluno_id <> professor_id),
  constraint planejamento_nome_unico    unique (aluno_id, nome),
  -- Alvo das FKs compostas das tabelas filhas: garante que a cópia
  -- denormalizada de aluno_id/professor_id nunca possa divergir do pai.
  constraint planejamento_contexto_uk   unique (id, aluno_id, professor_id)
);

-- Um planejamento ativo por aluno. Torna inexprimível o estado "dois ativos"
-- (o aluno vê um, o professor edita outro) e o estado "zero ativos".
create unique index if not exists planejamento_ativo_uidx
  on public.planejamentos (aluno_id)
  where status = 'ativo' and excluido_em is null;

create index if not exists planejamento_professor_idx
  on public.planejamentos (professor_id, aluno_id)
  where excluido_em is null;


create table if not exists public.planejamento_blocos (
  id                uuid primary key default gen_random_uuid(),
  planejamento_id   uuid not null,
  aluno_id          uuid not null,
  professor_id      uuid not null,
  catalogo_bloco_id uuid references public.catalogo_blocos(id) on delete restrict,

  disciplina_nome   text not null,
  disciplina_cor    text not null default '#5B6B85',
  disciplina_meta   smallint not null default 80 check (disciplina_meta between 0 and 100),
  nome              text not null,
  link              text,
  questoes_qtd      integer not null default 0 check (questoes_qtd >= 0),
  ordem_disciplina  integer not null check (ordem_disciplina >= 0),
  ordem_bloco       integer not null check (ordem_bloco >= 0),
  ativo             boolean not null default true,

  criado_em         timestamptz not null default now(),
  atualizado_em     timestamptz not null default now(),
  excluido_em       timestamptz,

  constraint planejamento_bloco_contexto_fk
    foreign key (planejamento_id, aluno_id, professor_id)
    references public.planejamentos (id, aluno_id, professor_id) on delete cascade,
  -- Alvo das FKs compostas de metas e baterias.
  constraint planejamento_bloco_contexto_uk unique (id, planejamento_id, aluno_id)
);

create unique index if not exists planejamento_bloco_ordem_uidx
  on public.planejamento_blocos (planejamento_id, ordem_disciplina, ordem_bloco)
  where excluido_em is null;

create index if not exists planejamento_bloco_plano_idx
  on public.planejamento_blocos (planejamento_id)
  where excluido_em is null and ativo;


-- Lote de aplicação do planejamento semanal. O `id` É o request_id gerado pelo
-- professor antes de enviar: reenviar o mesmo lote é no-op, não duplica a semana.
create table if not exists public.lotes_planejamento (
  id              uuid primary key,
  planejamento_id uuid not null references public.planejamentos(id) on delete cascade,
  semana_numero   smallint not null check (semana_numero between 1 and 200),
  modo            public.modo_lote not null,
  metas_qtd       integer not null check (metas_qtd >= 0),
  aplicado_em     timestamptz not null default now(),
  aplicado_por    uuid not null references public.perfis(id) on delete restrict
);

create index if not exists lote_planejamento_idx
  on public.lotes_planejamento (planejamento_id, semana_numero, aplicado_em desc);


-- -----------------------------------------------------------------------------
-- 3.4 Metas
-- -----------------------------------------------------------------------------
-- Sem campo de texto multiuso e sem contadores. Cada metadado que antes era
-- codificado dentro de `descricao` (TIPO_REFORCO:1, REFORCO_ORIGEM_ID:<uuid>,
-- ORIGEM_SEMANA:n, TIPO_EXTRA:1, ATIVIDADE_EXTRA:..., BORA_BATERIA_V1:<base64>)
-- é agora coluna tipada, FK ou linha em bateria_questoes.

create table if not exists public.metas (
  id                   uuid primary key default gen_random_uuid(),
  planejamento_id      uuid not null,
  aluno_id             uuid not null,
  professor_id         uuid not null,
  lote_id              uuid references public.lotes_planejamento(id) on delete set null,

  semana_numero        smallint not null check (semana_numero between 1 and 200),
  dia_semana           smallint not null check (dia_semana between 0 and 6),
  ordem_dia            smallint not null check (ordem_dia > 0),

  tipo                 public.tipo_meta   not null,
  status               public.status_meta not null default 'pendente',

  bloco_id             uuid,
  titulo               text not null check (length(btrim(titulo)) > 0),
  observacao_professor text,
  observacao_aluno     text,
  link_externo         text,
  tempo_previsto_min   integer check (tempo_previsto_min > 0),

  -- Era REFORCO_ORIGEM_ID dentro de descricao. Agora é FK de verdade.
  meta_origem_id       uuid references public.metas(id) on delete restrict,
  origem_semana        smallint check (origem_semana between 1 and 200),
  reforco_ignorado     boolean not null default false,
  atividade_extra      text,

  concluida_em         timestamptz,
  criado_em            timestamptz not null default now(),
  atualizado_em        timestamptz not null default now(),
  excluido_em          timestamptz,
  criado_por           uuid not null references public.perfis(id) on delete restrict,

  constraint meta_contexto_fk
    foreign key (planejamento_id, aluno_id, professor_id)
    references public.planejamentos (id, aluno_id, professor_id) on delete restrict,
  constraint meta_bloco_fk
    foreign key (bloco_id, planejamento_id, aluno_id)
    references public.planejamento_blocos (id, planejamento_id, aluno_id) on delete restrict,

  constraint meta_bloco_exigido
    check (tipo <> 'bloco_questoes' or bloco_id is not null),
  constraint meta_reforco_tem_origem
    check (tipo <> 'reforco' or meta_origem_id is not null),
  constraint meta_extra_tem_atividade
    check (tipo <> 'estudo_extra' or atividade_extra is not null),
  constraint meta_conclusao_coerente
    check ((status = 'concluida') = (concluida_em is not null)),
  constraint meta_origem_nao_reflexiva
    check (meta_origem_id is null or meta_origem_id <> id)
);

-- Torna a colisão de posição um erro do banco em vez de dado sujo.
-- O predicado parcial é o que permite o fluxo "substituir": a meta antiga é
-- marcada como excluída e sai do índice, liberando a posição para a nova.
create unique index if not exists meta_posicao_uidx
  on public.metas (planejamento_id, semana_numero, dia_semana, ordem_dia)
  where excluido_em is null;

create index if not exists meta_agenda_idx
  on public.metas (planejamento_id, semana_numero, dia_semana, ordem_dia)
  where excluido_em is null;

create index if not exists meta_aluno_status_idx
  on public.metas (aluno_id, status)
  where excluido_em is null;

create index if not exists meta_origem_idx
  on public.metas (meta_origem_id)
  where meta_origem_id is not null;


-- -----------------------------------------------------------------------------
-- 3.5 Baterias
-- -----------------------------------------------------------------------------

create table if not exists public.baterias (
  id                 uuid primary key default gen_random_uuid(),
  planejamento_id    uuid not null,
  aluno_id           uuid not null,
  professor_id       uuid not null,
  bloco_id           uuid not null,
  -- RESTRICT, não SET NULL: uma bateria nunca perde o vínculo com sua meta.
  meta_id            uuid references public.metas(id) on delete restrict,
  origem             public.origem_bateria not null default 'meta',

  sequencia_execucao integer  not null check (sequencia_execucao > 0),
  numero_bateria     integer  check (numero_bateria > 0),
  principais_alvo    smallint not null default 15 check (principais_alvo between 1 and 50),

  status             public.status_bateria not null default 'em_andamento',
  tempo_minutos      integer check (tempo_minutos > 0),

  finalizacao_id     uuid,
  iniciada_em        timestamptz not null default now(),
  finalizada_em      timestamptz,
  concluida_em       timestamptz,
  cancelada_em       timestamptz,
  anulada_em         timestamptz,
  anulada_por        uuid references public.perfis(id) on delete restrict,
  motivo_anulacao    text,
  atualizado_em      timestamptz not null default now(),

  constraint bateria_contexto_fk
    foreign key (planejamento_id, aluno_id, professor_id)
    references public.planejamentos (id, aluno_id, professor_id) on delete restrict,
  constraint bateria_bloco_fk
    foreign key (bloco_id, planejamento_id, aluno_id)
    references public.planejamento_blocos (id, planejamento_id, aluno_id) on delete restrict,

  constraint bateria_origem_check check (
    (origem = 'meta'          and meta_id is not null and numero_bateria is not null)
    or
    (origem = 'caderno_erros' and meta_id is null     and numero_bateria is null)
  ),

  -- Máquina de estados declarativa. Cada status define exatamente quais marcos
  -- temporais existem. Os contadores saíram: a contagem vem do ledger, e a
  -- validação de quantidade acontece dentro de finalizar_bateria.
  constraint bateria_estado_check check (
    case status
      when 'em_andamento' then
        finalizada_em is null and concluida_em is null and cancelada_em is null
        and anulada_em is null and anulada_por is null
        and tempo_minutos is null and finalizacao_id is null
      when 'aguardando_tempo' then
        finalizada_em is not null and concluida_em is null and cancelada_em is null
        and anulada_em is null and anulada_por is null
        and tempo_minutos is null and finalizacao_id is not null
      when 'concluida' then
        finalizada_em is not null and concluida_em is not null and cancelada_em is null
        and anulada_em is null and anulada_por is null
        and tempo_minutos is not null and finalizacao_id is not null
      when 'cancelada' then
        finalizada_em is not null and cancelada_em is not null and concluida_em is null
        and anulada_em is null and anulada_por is null
        and tempo_minutos is null and finalizacao_id is not null
      when 'anulada' then
        finalizada_em is not null and cancelada_em is null
        and anulada_em is not null and anulada_por is not null
        and finalizacao_id is not null
      else false
    end
  )
);

-- Uma bateria aberta por planejamento. Antes isso era validado só dentro da RPC.
create unique index if not exists bateria_aberta_uidx
  on public.baterias (planejamento_id)
  where status in ('em_andamento','aguardando_tempo');

-- Número visível do bloco: cancelada/anulada não consome o número.
create unique index if not exists bateria_numero_uidx
  on public.baterias (planejamento_id, bloco_id, numero_bateria)
  where numero_bateria is not null and status not in ('cancelada','anulada');

-- Uma meta só pode ter uma bateria válida; pode ser refeita se a anterior caiu.
create unique index if not exists bateria_meta_uidx
  on public.baterias (meta_id)
  where meta_id is not null and status not in ('cancelada','anulada');

create unique index if not exists bateria_finalizacao_uidx
  on public.baterias (finalizacao_id)
  where finalizacao_id is not null;

create index if not exists bateria_aluno_idx
  on public.baterias (aluno_id, planejamento_id, iniciada_em desc);

create index if not exists bateria_bloco_concluida_idx
  on public.baterias (planejamento_id, bloco_id)
  where status = 'concluida';


-- -----------------------------------------------------------------------------
-- 3.6 Ledger de questões — a fonte única de verdade
-- -----------------------------------------------------------------------------
-- Append-only. Todo número de desempenho do sistema é derivado desta tabela.
-- Nenhum agregado é escrito à mão em lugar nenhum.

create table if not exists public.bateria_questoes (
  id                uuid   primary key default gen_random_uuid(),
  bateria_id        uuid   not null references public.baterias(id) on delete restrict,
  questao_id        bigint not null check (questao_id > 0),
  ordem_execucao    smallint not null check (ordem_execucao > 0),
  rodada            smallint not null default 0 check (rodada >= 0),
  fase              public.fase_questao      not null,
  resultado         public.resultado_questao not null,
  topico            text,
  origem_questao_id bigint check (origem_questao_id > 0),
  respondida_em     timestamptz not null,
  registrado_em     timestamptz not null default now(),

  -- Impede que um retry duplique respostas dentro da mesma bateria, mesmo que
  -- a chave de idempotência falhe na camada de cima.
  constraint bateria_questao_unica  unique (bateria_id, questao_id, rodada),
  constraint bateria_ordem_unica    unique (bateria_id, ordem_execucao),
  constraint reforco_tem_origem
    check ((fase = 'reforco') = (origem_questao_id is not null))
);

create index if not exists bateria_questoes_bateria_idx
  on public.bateria_questoes (bateria_id, fase);

create index if not exists bateria_questoes_questao_idx
  on public.bateria_questoes (questao_id);


-- -----------------------------------------------------------------------------
-- 3.7 Reforços por ciclo
-- -----------------------------------------------------------------------------
-- Sem uuid[], sem chave derivada por concatenação e sem JSONB: tabela de junção
-- com integridade referencial e tabela filha agregável em SQL.

create table if not exists public.reforcos (
  id                uuid primary key default gen_random_uuid(),
  planejamento_id   uuid not null,
  aluno_id          uuid not null,
  professor_id      uuid not null,
  bloco_id          uuid not null,
  request_id        uuid not null unique,
  cutoff            timestamptz not null,
  desempenho_origem smallint not null check (desempenho_origem between 0 and 100),
  concluido_em      timestamptz not null default now(),
  criado_em         timestamptz not null default now(),

  constraint reforco_contexto_fk
    foreign key (planejamento_id, aluno_id, professor_id)
    references public.planejamentos (id, aluno_id, professor_id) on delete restrict,
  constraint reforco_bloco_fk
    foreign key (bloco_id, planejamento_id, aluno_id)
    references public.planejamento_blocos (id, planejamento_id, aluno_id) on delete restrict
);

create index if not exists reforco_aluno_idx
  on public.reforcos (aluno_id, planejamento_id, concluido_em desc);


-- Substitui `baterias_origem uuid[]` + `ciclo_chave`.
create table if not exists public.reforco_baterias (
  reforco_id uuid not null references public.reforcos(id) on delete cascade,
  bateria_id uuid not null references public.baterias(id) on delete restrict,
  primary key (reforco_id, bateria_id),
  -- Garantia mais forte que a chave de ciclo concatenada: uma bateria não pode
  -- ser reaproveitada em dois ciclos de reforço diferentes.
  constraint bateria_em_um_unico_ciclo unique (bateria_id)
);


-- Substitui `resultado_reforco jsonb`.
create table if not exists public.reforco_questoes (
  reforco_id uuid   not null references public.reforcos(id) on delete cascade,
  questao_id bigint not null check (questao_id > 0),
  fase       public.fase_questao      not null,
  resultado  public.resultado_questao not null,
  topico     text,
  primary key (reforco_id, questao_id)
);


-- Estado do ciclo de revisão. Antes vivia só no localStorage, o que fazia o
-- aluno refazer reforços concluídos ao trocar de navegador.
create table if not exists public.ciclos_revisao (
  id           uuid primary key default gen_random_uuid(),
  aluno_id     uuid not null references public.perfis(id) on delete cascade,
  bloco_id     uuid not null references public.planejamento_blocos(id) on delete cascade,
  cutoff       timestamptz not null,
  concluido_em timestamptz not null default now(),
  reforco_id   uuid references public.reforcos(id) on delete set null,
  unique (aluno_id, bloco_id, cutoff)
);

create index if not exists ciclo_revisao_bloco_idx
  on public.ciclos_revisao (aluno_id, bloco_id, cutoff desc);


-- -----------------------------------------------------------------------------
-- 3.8 Preferências, idempotência e auditoria
-- -----------------------------------------------------------------------------

-- jsonb é apropriado aqui: preferência de interface, sem relacionamento nem
-- necessidade de agregação. O critério não é "jsonb é ruim", é se o conteúdo
-- tem estrutura relacional que precisa de integridade ou consulta.
create table if not exists public.aluno_preferencias (
  aluno_id       uuid primary key references public.perfis(id) on delete cascade,
  tema           text not null default 'claro',
  ciclo_config   jsonb not null default '{}'::jsonb,
  revisao_config jsonb not null default '{}'::jsonb,
  atualizado_em  timestamptz not null default now()
);


-- Registro de operações mutantes. O par (request_id, payload_hash) é o que
-- torna todo retry seguro: mesmo hash devolve o resultado anterior sem
-- reexecutar; hash diferente é rejeitado em vez de aceito como replay.
create table if not exists public.operacoes (
  request_id   uuid primary key,
  operacao     text not null,
  ator_id      uuid not null references public.perfis(id) on delete restrict,
  alvo_id      uuid,
  payload_hash text not null,
  resultado    jsonb,
  criado_em    timestamptz not null default now()
);

create index if not exists operacao_alvo_idx on public.operacoes (alvo_id, operacao, criado_em desc);


create table if not exists public.auditoria (
  id             bigint generated always as identity primary key,
  tabela         text not null,
  registro_id    uuid not null,
  acao           text not null check (acao in ('insert','update','delete')),
  ator_id        uuid,
  valor_anterior jsonb,
  valor_novo     jsonb,
  motivo         text,
  ocorrido_em    timestamptz not null default now()
);

create index if not exists auditoria_registro_idx
  on public.auditoria (tabela, registro_id, ocorrido_em desc);


-- =============================================================================
-- 4. VIEWS DE DESEMPENHO
-- =============================================================================
-- security_invoker garante que a RLS das tabelas base seja aplicada a quem
-- consulta a view — sem isso a view rodaria com os privilégios do dono e
-- vazaria dados entre alunos.

create or replace view public.vw_bateria_desempenho
with (security_invoker = true) as
select
  b.id              as bateria_id,
  b.aluno_id,
  b.professor_id,
  b.planejamento_id,
  b.bloco_id,
  b.meta_id,
  b.status,
  b.principais_alvo,
  b.tempo_minutos,
  count(*) filter (where q.fase = 'principal')                                as principais_qtd,
  count(*) filter (where q.fase = 'principal' and q.resultado = 'acertou')    as principais_acertos,
  count(*) filter (where q.fase = 'principal' and q.resultado = 'errou')      as principais_erros,
  count(*) filter (where q.fase = 'reforco')                                  as reforcos_qtd,
  count(*) filter (where q.fase = 'reforco'   and q.resultado = 'acertou')    as reforcos_acertos,
  count(*) filter (where q.fase = 'extra')                                    as extras_qtd,
  count(*) filter (where q.fase = 'extra'     and q.resultado = 'acertou')    as extras_acertos
from public.baterias b
left join public.bateria_questoes q on q.bateria_id = b.id
group by b.id;


create or replace view public.vw_meta_desempenho
with (security_invoker = true) as
select
  m.id            as meta_id,
  m.aluno_id,
  m.professor_id,
  m.planejamento_id,
  m.status,
  coalesce(sum(d.principais_qtd), 0)     as questoes_feitas,
  coalesce(sum(d.principais_acertos), 0) as acertos,
  sum(b.tempo_minutos)                   as tempo_gasto_min
from public.metas m
left join public.baterias b
       on b.meta_id = m.id and b.status = 'concluida'
left join public.vw_bateria_desempenho d
       on d.bateria_id = b.id
where m.excluido_em is null
group by m.id;


-- Substitui o SELECT que trazia dezenas de milhares de linhas de
-- questoes_resultados para agregar em JavaScript sob o teto de linhas do
-- PostgREST. Aqui volta uma linha por questão distinta — algumas centenas.
create or replace view public.vw_questoes_vistas
with (security_invoker = true) as
select
  b.aluno_id,
  b.planejamento_id,
  b.bloco_id,
  q.questao_id,
  count(*)                                              as vezes_vista,
  count(*) filter (where q.resultado = 'acertou')       as acertos,
  count(*) filter (where q.resultado = 'errou')         as erros,
  max(q.respondida_em)                                  as ultima_vez
from public.bateria_questoes q
join public.baterias b on b.id = q.bateria_id
where b.status = 'concluida'
group by b.aluno_id, b.planejamento_id, b.bloco_id, q.questao_id;


create or replace view public.vw_bloco_desempenho
with (security_invoker = true) as
select
  d.aluno_id,
  d.planejamento_id,
  d.bloco_id,
  count(*)                                     as baterias_qtd,
  sum(d.principais_qtd)                        as principais_qtd,
  sum(d.principais_acertos)                    as principais_acertos,
  case when sum(d.principais_qtd) > 0
       then round(100.0 * sum(d.principais_acertos) / sum(d.principais_qtd))::smallint
       else null end                           as desempenho_pct
from public.vw_bateria_desempenho d
where d.status = 'concluida'
group by d.aluno_id, d.planejamento_id, d.bloco_id;


-- =============================================================================
-- 5. TRIGGERS
-- =============================================================================

do $$
declare
  t text;
begin
  foreach t in array array[
    'perfis','assinaturas','lista_espera','catalogo_blocos','planejamentos',
    'planejamento_blocos','metas','baterias','aluno_preferencias'
  ] loop
    execute format(
      'drop trigger if exists tg_%1$s_atualizado_em on public.%1$s;
       create trigger tg_%1$s_atualizado_em before update on public.%1$s
         for each row execute function public.tg_atualizar_timestamp();', t);
  end loop;
end;
$$;


-- O ledger é append-only: nem UPDATE nem DELETE, nem por RPC security definer.
create or replace function public.tg_ledger_imutavel()
returns trigger
language plpgsql
as $$
begin
  raise exception 'bateria_questoes e append-only: % nao permitido', tg_op
    using errcode = '0A000';
end;
$$;

drop trigger if exists tg_bateria_questoes_imutavel on public.bateria_questoes;
create trigger tg_bateria_questoes_imutavel
  before update or delete on public.bateria_questoes
  for each row execute function public.tg_ledger_imutavel();


create or replace function public.tg_registrar_auditoria()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old jsonb;
  v_new jsonb;
  v_id  uuid;
begin
  if tg_op in ('UPDATE','DELETE') then v_old := to_jsonb(old); end if;
  if tg_op in ('INSERT','UPDATE') then v_new := to_jsonb(new); end if;
  v_id := coalesce((v_new->>'id')::uuid, (v_old->>'id')::uuid);

  insert into public.auditoria (tabela, registro_id, acao, ator_id, valor_anterior, valor_novo)
  values (tg_table_name, v_id, lower(tg_op), auth.uid(), v_old, v_new);

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array['planejamentos','metas','baterias','assinaturas'] loop
    execute format(
      'drop trigger if exists tg_%1$s_auditoria on public.%1$s;
       create trigger tg_%1$s_auditoria after insert or update or delete on public.%1$s
         for each row execute function public.tg_registrar_auditoria();', t);
  end loop;
end;
$$;


-- Criação automática do perfil quando um usuário se registra.
create or replace function public.tg_criar_perfil_novo_usuario()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.perfis (id, papel, nome, email_contato)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data->>'papel',''), 'aluno')::public.papel_usuario,
    coalesce(
      nullif(btrim(new.raw_user_meta_data->>'nome'), ''),
      nullif(btrim(new.raw_user_meta_data->>'full_name'), ''),
      split_part(coalesce(new.email,'aluno'), '@', 1)
    ),
    new.email
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.tg_criar_perfil_novo_usuario();


-- =============================================================================
-- 6. ROW LEVEL SECURITY
-- =============================================================================
-- Helpers SECURITY DEFINER para evitar recursão entre políticas.

create or replace function public.eh_professor()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.perfis p where p.id = auth.uid() and p.papel in ('professor','admin'));
$$;

create or replace function public.eh_professor_de(p_aluno_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.vinculos_aluno_professor v
     where v.aluno_id = p_aluno_id and v.professor_id = auth.uid() and v.encerrado_em is null
  );
$$;

-- Predicado padrão das tabelas que carregam o contexto denormalizado.
create or replace function public.pode_ver_contexto(p_aluno_id uuid, p_professor_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() = p_aluno_id or auth.uid() = p_professor_id;
$$;

alter table public.perfis                   enable row level security;
alter table public.cupons                   enable row level security;
alter table public.vinculos_aluno_professor enable row level security;
alter table public.assinaturas              enable row level security;
alter table public.lista_espera             enable row level security;
alter table public.catalogos                enable row level security;
alter table public.catalogo_blocos          enable row level security;
alter table public.catalogo_questoes        enable row level security;
alter table public.planejamentos            enable row level security;
alter table public.planejamento_blocos      enable row level security;
alter table public.lotes_planejamento       enable row level security;
alter table public.metas                    enable row level security;
alter table public.baterias                 enable row level security;
alter table public.bateria_questoes         enable row level security;
alter table public.reforcos                 enable row level security;
alter table public.reforco_baterias         enable row level security;
alter table public.reforco_questoes         enable row level security;
alter table public.ciclos_revisao           enable row level security;
alter table public.aluno_preferencias       enable row level security;
alter table public.operacoes                enable row level security;
alter table public.auditoria                enable row level security;

-- perfis
drop policy if exists perfis_leitura on public.perfis;
create policy perfis_leitura on public.perfis for select to authenticated
  using (id = auth.uid() or public.eh_professor_de(id));

drop policy if exists perfis_atualiza_proprio on public.perfis;
create policy perfis_atualiza_proprio on public.perfis for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid() and papel = (select p.papel from public.perfis p where p.id = auth.uid()));

-- vínculos
drop policy if exists vinculos_leitura on public.vinculos_aluno_professor;
create policy vinculos_leitura on public.vinculos_aluno_professor for select to authenticated
  using (aluno_id = auth.uid() or professor_id = auth.uid());

-- assinaturas: leitura própria; escrita só por service_role.
drop policy if exists assinaturas_leitura on public.assinaturas;
create policy assinaturas_leitura on public.assinaturas for select to authenticated
  using (aluno_id = auth.uid() or public.eh_professor_de(aluno_id));

-- cupons: só o código público, para validação no cadastro.
drop policy if exists cupons_leitura on public.cupons;
create policy cupons_leitura on public.cupons for select to authenticated
  using (ativo and (valido_ate is null or valido_ate >= current_date));

-- lista de espera
drop policy if exists espera_propria on public.lista_espera;
create policy espera_propria on public.lista_espera for all to authenticated
  using (aluno_id = auth.uid() or public.eh_professor_de(aluno_id))
  with check (aluno_id = auth.uid());

-- catálogo: leitura para todo autenticado.
drop policy if exists catalogos_leitura on public.catalogos;
create policy catalogos_leitura on public.catalogos for select to authenticated using (ativo);

drop policy if exists catalogo_blocos_leitura on public.catalogo_blocos;
create policy catalogo_blocos_leitura on public.catalogo_blocos for select to authenticated using (ativo);

drop policy if exists catalogo_questoes_leitura on public.catalogo_questoes;
create policy catalogo_questoes_leitura on public.catalogo_questoes for select to authenticated using (true);

-- planejamento e execução: leitura pelo contexto, escrita só por RPC.
drop policy if exists planejamentos_leitura on public.planejamentos;
create policy planejamentos_leitura on public.planejamentos for select to authenticated
  using (public.pode_ver_contexto(aluno_id, professor_id));

drop policy if exists planejamento_blocos_leitura on public.planejamento_blocos;
create policy planejamento_blocos_leitura on public.planejamento_blocos for select to authenticated
  using (public.pode_ver_contexto(aluno_id, professor_id));

drop policy if exists lotes_leitura on public.lotes_planejamento;
create policy lotes_leitura on public.lotes_planejamento for select to authenticated
  using (exists (select 1 from public.planejamentos p
                  where p.id = planejamento_id and public.pode_ver_contexto(p.aluno_id, p.professor_id)));

drop policy if exists metas_leitura on public.metas;
create policy metas_leitura on public.metas for select to authenticated
  using (public.pode_ver_contexto(aluno_id, professor_id));

drop policy if exists baterias_leitura on public.baterias;
create policy baterias_leitura on public.baterias for select to authenticated
  using (public.pode_ver_contexto(aluno_id, professor_id));

drop policy if exists bateria_questoes_leitura on public.bateria_questoes;
create policy bateria_questoes_leitura on public.bateria_questoes for select to authenticated
  using (exists (select 1 from public.baterias b
                  where b.id = bateria_id and public.pode_ver_contexto(b.aluno_id, b.professor_id)));

drop policy if exists reforcos_leitura on public.reforcos;
create policy reforcos_leitura on public.reforcos for select to authenticated
  using (public.pode_ver_contexto(aluno_id, professor_id));

drop policy if exists reforco_baterias_leitura on public.reforco_baterias;
create policy reforco_baterias_leitura on public.reforco_baterias for select to authenticated
  using (exists (select 1 from public.reforcos r
                  where r.id = reforco_id and public.pode_ver_contexto(r.aluno_id, r.professor_id)));

drop policy if exists reforco_questoes_leitura on public.reforco_questoes;
create policy reforco_questoes_leitura on public.reforco_questoes for select to authenticated
  using (exists (select 1 from public.reforcos r
                  where r.id = reforco_id and public.pode_ver_contexto(r.aluno_id, r.professor_id)));

drop policy if exists ciclos_revisao_proprio on public.ciclos_revisao;
create policy ciclos_revisao_proprio on public.ciclos_revisao for select to authenticated
  using (aluno_id = auth.uid() or public.eh_professor_de(aluno_id));

-- Preferências: única tabela em que o client escreve direto. É estado de UI,
-- não dado de domínio, e a chave primária já é o próprio dono.
drop policy if exists preferencias_proprias on public.aluno_preferencias;
create policy preferencias_proprias on public.aluno_preferencias for all to authenticated
  using (aluno_id = auth.uid()) with check (aluno_id = auth.uid());

drop policy if exists operacoes_proprias on public.operacoes;
create policy operacoes_proprias on public.operacoes for select to authenticated
  using (ator_id = auth.uid());

drop policy if exists auditoria_leitura on public.auditoria;
create policy auditoria_leitura on public.auditoria for select to authenticated
  using (public.eh_professor());


-- =============================================================================
-- 7. RPCs — a única via de escrita nas tabelas transacionais
-- =============================================================================

-- Idempotência compartilhada. Devolve o resultado anterior se o mesmo
-- request_id chegar com o mesmo payload; rejeita se o payload mudou.
create or replace function public.reservar_operacao(
  p_request_id uuid,
  p_operacao   text,
  p_alvo_id    uuid,
  p_payload    text,
  out reservada boolean,
  out anterior  jsonb
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hash text := md5(coalesce(p_payload, ''));
  v_prev public.operacoes%rowtype;
begin
  if p_request_id is null then
    raise exception 'request_id obrigatorio' using errcode = '22004';
  end if;

  insert into public.operacoes (request_id, operacao, ator_id, alvo_id, payload_hash)
  values (p_request_id, p_operacao, auth.uid(), p_alvo_id, v_hash)
  on conflict (request_id) do nothing;

  if found then
    reservada := true;
    anterior  := null;
    return;
  end if;

  select * into v_prev from public.operacoes o where o.request_id = p_request_id;

  if v_prev.payload_hash <> v_hash then
    raise exception 'request_id % ja utilizado com outro payload', p_request_id
      using errcode = '23505';
  end if;

  reservada := false;
  anterior  := coalesce(v_prev.resultado, '{}'::jsonb);
end;
$$;


-- -----------------------------------------------------------------------------
-- 7.1 Ativar planejamento (troca atômica)
-- -----------------------------------------------------------------------------
create or replace function public.ativar_planejamento(p_planejamento_id uuid)
returns public.planejamentos
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid  uuid := auth.uid();
  v_plan public.planejamentos%rowtype;
begin
  if v_uid is null then raise exception 'usuario nao autenticado' using errcode='28000'; end if;

  select * into v_plan from public.planejamentos p
   where p.id = p_planejamento_id and p.excluido_em is null
   for update;
  if not found then raise exception 'planejamento nao encontrado'; end if;
  if v_plan.professor_id <> v_uid then
    raise exception 'somente o professor responsavel pode ativar o planejamento' using errcode='42501';
  end if;

  -- Arquiva e ativa na mesma transação. O índice parcial planejamento_ativo_uidx
  -- torna impossível terminar com dois ativos ou com nenhum.
  update public.planejamentos
     set status = 'arquivado'
   where aluno_id = v_plan.aluno_id
     and status = 'ativo'
     and id <> p_planejamento_id
     and excluido_em is null;

  update public.planejamentos
     set status = 'ativo'
   where id = p_planejamento_id
   returning * into v_plan;

  return v_plan;
end;
$$;


-- -----------------------------------------------------------------------------
-- 7.2 Aplicar lote de metas da semana
-- -----------------------------------------------------------------------------
-- Substitui o DELETE + INSERT não transacional feito pelo client. Reenviar o
-- mesmo lote é no-op; um DELETE que falha aborta a transação inteira.
create or replace function public.aplicar_lote_planejamento(
  p_lote_id         uuid,
  p_planejamento_id uuid,
  p_semana          smallint,
  p_modo            public.modo_lote,
  p_metas           jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := auth.uid();
  v_plan   public.planejamentos%rowtype;
  v_qtd    integer;
  v_bloq   integer;
  v_res    jsonb;
begin
  if v_uid is null then raise exception 'usuario nao autenticado' using errcode='28000'; end if;
  if p_metas is null or jsonb_typeof(p_metas) <> 'array' then
    raise exception 'p_metas deve ser um array JSON';
  end if;

  -- Replay: o lote já foi aplicado, devolve o resultado sem tocar em metas.
  select l.metas_qtd into v_qtd from public.lotes_planejamento l where l.id = p_lote_id;
  if found then
    return jsonb_build_object('lote_id', p_lote_id, 'metas_inseridas', v_qtd, 'replay', true);
  end if;

  select * into v_plan from public.planejamentos p
   where p.id = p_planejamento_id and p.excluido_em is null
   for update;
  if not found then raise exception 'planejamento nao encontrado'; end if;
  if v_plan.professor_id <> v_uid then
    raise exception 'somente o professor responsavel pode planejar' using errcode='42501';
  end if;

  -- Uma bateria aberta impede substituir a semana: os resultados dela ainda
  -- não foram gravados e seriam perdidos.
  if p_modo in ('substituir','replanejar') then
    select count(*) into v_bloq
      from public.baterias b
      join public.metas m on m.id = b.meta_id
     where m.planejamento_id = p_planejamento_id
       and m.semana_numero = p_semana
       and m.excluido_em is null
       and b.status in ('em_andamento','aguardando_tempo');
    if v_bloq > 0 then
      raise exception 'ha bateria aberta nesta semana; finalize ou cancele antes de replanejar';
    end if;
  end if;

  -- Soft delete. Metas concluídas só saem no modo replanejar, e mesmo assim
  -- continuam na tabela e na auditoria.
  if p_modo = 'substituir' then
    update public.metas
       set excluido_em = now()
     where planejamento_id = p_planejamento_id
       and semana_numero = p_semana
       and excluido_em is null
       and status in ('pendente','em_andamento','pulada');
  elsif p_modo = 'replanejar' then
    update public.metas
       set excluido_em = now()
     where planejamento_id = p_planejamento_id
       and semana_numero = p_semana
       and excluido_em is null
       and not exists (select 1 from public.baterias b
                        where b.meta_id = metas.id and b.status = 'concluida');
  end if;

  insert into public.lotes_planejamento (id, planejamento_id, semana_numero, modo, metas_qtd, aplicado_por)
  values (p_lote_id, p_planejamento_id, p_semana, p_modo, jsonb_array_length(p_metas), v_uid);

  -- ordem_dia é gerada aqui, continuando a maior ordem sobrevivente do dia.
  -- Nunca é calculada no client por leitura-do-máximo.
  with entrada as (
    select
      x.dia_semana,
      x.tipo,
      x.bloco_id,
      x.titulo,
      x.observacao_professor,
      x.link_externo,
      x.tempo_previsto_min,
      x.meta_origem_id,
      x.origem_semana,
      x.atividade_extra,
      row_number() over (partition by x.dia_semana order by x.posicao, x.titulo) as seq
    from jsonb_to_recordset(p_metas) as x(
      dia_semana           smallint,
      posicao              integer,
      tipo                 text,
      bloco_id             uuid,
      titulo               text,
      observacao_professor text,
      link_externo         text,
      tempo_previsto_min   integer,
      meta_origem_id       uuid,
      origem_semana        smallint,
      atividade_extra      text
    )
  ),
  base as (
    select e.*, coalesce(
      (select max(m.ordem_dia) from public.metas m
        where m.planejamento_id = p_planejamento_id
          and m.semana_numero = p_semana
          and m.dia_semana = e.dia_semana
          and m.excluido_em is null), 0) as offset_dia
    from entrada e
  )
  insert into public.metas (
    planejamento_id, aluno_id, professor_id, lote_id,
    semana_numero, dia_semana, ordem_dia,
    tipo, bloco_id, titulo, observacao_professor, link_externo,
    tempo_previsto_min, meta_origem_id, origem_semana, atividade_extra, criado_por
  )
  select
    p_planejamento_id, v_plan.aluno_id, v_plan.professor_id, p_lote_id,
    p_semana, b.dia_semana, (b.offset_dia + b.seq)::smallint,
    b.tipo::public.tipo_meta, b.bloco_id, b.titulo, b.observacao_professor, b.link_externo,
    b.tempo_previsto_min, b.meta_origem_id, b.origem_semana, b.atividade_extra, v_uid
  from base b;

  get diagnostics v_qtd = row_count;

  v_res := jsonb_build_object('lote_id', p_lote_id, 'metas_inseridas', v_qtd, 'replay', false);
  update public.operacoes set resultado = v_res where request_id = p_lote_id;
  return v_res;
end;
$$;


-- -----------------------------------------------------------------------------
-- 7.3 Iniciar bateria
-- -----------------------------------------------------------------------------
create or replace function public.iniciar_bateria(
  p_planejamento_id uuid,
  p_bloco_id        uuid,
  p_meta_id         uuid
)
returns public.baterias
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid       uuid := auth.uid();
  v_plan      public.planejamentos%rowtype;
  v_bloco     public.planejamento_blocos%rowtype;
  v_meta      public.metas%rowtype;
  v_bateria   public.baterias%rowtype;
  v_sequencia integer;
  v_numero    integer;
begin
  if v_uid is null then raise exception 'usuario nao autenticado' using errcode='28000'; end if;

  select * into v_plan from public.planejamentos p
   where p.id = p_planejamento_id and p.status = 'ativo' and p.excluido_em is null
   for update;
  if not found then raise exception 'planejamento nao esta ativo'; end if;
  if v_plan.aluno_id <> v_uid then
    raise exception 'somente o aluno pode iniciar a bateria' using errcode='42501';
  end if;

  select * into v_bloco from public.planejamento_blocos pb
   where pb.id = p_bloco_id and pb.planejamento_id = p_planejamento_id
     and pb.ativo and pb.excluido_em is null;
  if not found then raise exception 'bloco invalido ou indisponivel'; end if;

  -- A retomada é avaliada ANTES da validação da meta: como iniciar_bateria
  -- move a meta para 'em_andamento', exigir 'pendente' aqui faria a segunda
  -- chamada falhar em vez de devolver a bateria já aberta.
  select * into v_bateria from public.baterias b
   where b.planejamento_id = p_planejamento_id
     and b.status in ('em_andamento','aguardando_tempo');
  if found then
    if v_bateria.meta_id = p_meta_id then return v_bateria; end if;
    raise exception 'ja existe uma bateria aberta neste planejamento';
  end if;

  select * into v_meta from public.metas m
   where m.id = p_meta_id and m.planejamento_id = p_planejamento_id
     and m.bloco_id = p_bloco_id and m.tipo = 'bloco_questoes'
     and m.status = 'pendente' and m.excluido_em is null;
  if not found then raise exception 'meta nao e uma meta de questoes pendente deste bloco'; end if;

  -- Seriação garantida pelo FOR UPDATE no planejamento, acima.
  select coalesce(max(b.sequencia_execucao), 0) + 1 into v_sequencia
    from public.baterias b
   where b.planejamento_id = p_planejamento_id and b.bloco_id = p_bloco_id;

  select coalesce(max(b.numero_bateria), 0) + 1 into v_numero
    from public.baterias b
   where b.planejamento_id = p_planejamento_id and b.bloco_id = p_bloco_id
     and b.numero_bateria is not null
     and b.status not in ('cancelada','anulada');

  insert into public.baterias (
    planejamento_id, aluno_id, professor_id, bloco_id, meta_id, origem,
    sequencia_execucao, numero_bateria, principais_alvo, status
  ) values (
    p_planejamento_id, v_plan.aluno_id, v_plan.professor_id, p_bloco_id, p_meta_id, 'meta',
    v_sequencia, v_numero, 15, 'em_andamento'
  ) returning * into v_bateria;

  update public.metas set status = 'em_andamento' where id = p_meta_id;

  return v_bateria;
end;
$$;


-- -----------------------------------------------------------------------------
-- 7.4 Finalizar bateria
-- -----------------------------------------------------------------------------
create or replace function public.finalizar_bateria(
  p_bateria_id uuid,
  p_request_id uuid,
  p_resultados jsonb,
  p_cancelar   boolean default false
)
returns public.baterias
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid        uuid := auth.uid();
  v_bateria    public.baterias%rowtype;
  v_reserva    record;
  v_principais integer;
  v_reforcos   integer;
  v_extras     integer;
begin
  if v_uid is null then raise exception 'usuario nao autenticado' using errcode='28000'; end if;
  if p_resultados is null or jsonb_typeof(p_resultados) <> 'array' then
    raise exception 'p_resultados deve ser um array JSON';
  end if;

  select * into v_reserva from public.reservar_operacao(
    p_request_id, 'finalizar_bateria', p_bateria_id,
    p_bateria_id::text || '|' || coalesce(p_cancelar,false)::text || '|' || p_resultados::text
  );

  select * into v_bateria from public.baterias b where b.id = p_bateria_id for update;
  if not found then raise exception 'bateria nao encontrada'; end if;
  if v_bateria.aluno_id <> v_uid then
    raise exception 'somente o aluno pode finalizar a bateria' using errcode='42501';
  end if;

  -- Replay: devolve o estado atual sem regravar nada.
  if not v_reserva.reservada then return v_bateria; end if;

  if v_bateria.status <> 'em_andamento' then
    raise exception 'bateria ja finalizada (status %)', v_bateria.status;
  end if;

  insert into public.bateria_questoes (
    bateria_id, questao_id, ordem_execucao, rodada, fase, resultado,
    topico, origem_questao_id, respondida_em
  )
  select
    p_bateria_id, x.questao_id, x.ordem_execucao, coalesce(x.rodada, 0),
    x.fase::public.fase_questao, x.resultado::public.resultado_questao,
    nullif(btrim(coalesce(x.topico,'')), ''), x.origem_questao_id,
    coalesce(x.respondida_em, now())
  from jsonb_to_recordset(p_resultados) as x(
    questao_id        bigint,
    ordem_execucao    smallint,
    rodada            smallint,
    fase              text,
    resultado         text,
    topico            text,
    origem_questao_id bigint,
    respondida_em     timestamptz
  );

  select
    count(*) filter (where fase = 'principal'),
    count(*) filter (where fase = 'reforco'),
    count(*) filter (where fase = 'extra')
    into v_principais, v_reforcos, v_extras
  from public.bateria_questoes where bateria_id = p_bateria_id;

  if not p_cancelar then
    if v_principais < 1 or v_principais > v_bateria.principais_alvo then
      raise exception 'bateria concluida exige entre 1 e % questoes principais', v_bateria.principais_alvo;
    end if;
    if (v_reforcos > 0 or v_extras > 0) and v_principais <> v_bateria.principais_alvo then
      raise exception 'reforcos/extras so podem existir depois de todas as principais';
    end if;
    if mod(v_extras, 5) <> 0 then
      raise exception 'questoes extras sao adicionadas em blocos de 5';
    end if;
  end if;

  if p_cancelar then
    update public.baterias
       set status = 'cancelada', finalizada_em = now(), cancelada_em = now(),
           finalizacao_id = p_request_id
     where id = p_bateria_id returning * into v_bateria;
    update public.metas set status = 'pendente'
     where id = v_bateria.meta_id and status = 'em_andamento';
  else
    update public.baterias
       set status = 'aguardando_tempo', finalizada_em = now(),
           finalizacao_id = p_request_id
     where id = p_bateria_id returning * into v_bateria;
  end if;

  update public.operacoes
     set resultado = jsonb_build_object('bateria_id', p_bateria_id, 'status', v_bateria.status)
   where request_id = p_request_id;

  return v_bateria;
end;
$$;


-- -----------------------------------------------------------------------------
-- 7.5 Registrar tempo (conclui a bateria e a meta)
-- -----------------------------------------------------------------------------
create or replace function public.registrar_tempo_bateria(
  p_bateria_id    uuid,
  p_request_id    uuid,
  p_tempo_minutos integer
)
returns public.baterias
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := auth.uid();
  v_bateria public.baterias%rowtype;
  v_reserva record;
begin
  if v_uid is null then raise exception 'usuario nao autenticado' using errcode='28000'; end if;
  if p_tempo_minutos is null or p_tempo_minutos <= 0 then
    raise exception 'tempo em minutos deve ser positivo';
  end if;

  select * into v_reserva from public.reservar_operacao(
    p_request_id, 'registrar_tempo_bateria', p_bateria_id,
    p_bateria_id::text || '|' || p_tempo_minutos::text
  );

  select * into v_bateria from public.baterias b where b.id = p_bateria_id for update;
  if not found then raise exception 'bateria nao encontrada'; end if;
  if v_bateria.aluno_id <> v_uid then
    raise exception 'somente o aluno pode registrar o tempo' using errcode='42501';
  end if;

  if not v_reserva.reservada then return v_bateria; end if;

  if v_bateria.status <> 'aguardando_tempo' then
    raise exception 'bateria nao esta aguardando tempo (status %)', v_bateria.status;
  end if;

  update public.baterias
     set status = 'concluida', concluida_em = now(), tempo_minutos = p_tempo_minutos
   where id = p_bateria_id returning * into v_bateria;

  update public.metas
     set status = 'concluida', concluida_em = now()
   where id = v_bateria.meta_id and excluido_em is null;

  update public.operacoes
     set resultado = jsonb_build_object('bateria_id', p_bateria_id, 'status', 'concluida')
   where request_id = p_request_id;

  return v_bateria;
end;
$$;


-- -----------------------------------------------------------------------------
-- 7.6 Anular bateria (professor)
-- -----------------------------------------------------------------------------
-- Nunca apaga: o ledger fica intacto e a meta volta a pendente.
create or replace function public.anular_bateria(
  p_bateria_id uuid,
  p_request_id uuid,
  p_motivo     text default null
)
returns public.baterias
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := auth.uid();
  v_bateria public.baterias%rowtype;
  v_reserva record;
begin
  if v_uid is null then raise exception 'usuario nao autenticado' using errcode='28000'; end if;

  select * into v_reserva from public.reservar_operacao(
    p_request_id, 'anular_bateria', p_bateria_id,
    p_bateria_id::text || '|' || coalesce(p_motivo,'')
  );

  select * into v_bateria from public.baterias b where b.id = p_bateria_id for update;
  if not found then raise exception 'bateria nao encontrada'; end if;
  if v_bateria.professor_id <> v_uid then
    raise exception 'somente o professor responsavel pode anular' using errcode='42501';
  end if;

  if not v_reserva.reservada then return v_bateria; end if;
  if v_bateria.status = 'anulada' then return v_bateria; end if;
  if v_bateria.status not in ('concluida','aguardando_tempo') then
    raise exception 'somente bateria finalizada pode ser anulada';
  end if;

  update public.baterias
     set status = 'anulada', anulada_em = now(), anulada_por = v_uid,
         concluida_em = null, tempo_minutos = null,
         motivo_anulacao = nullif(btrim(coalesce(p_motivo,'')), '')
   where id = p_bateria_id returning * into v_bateria;

  -- meta_id nunca é nulo aqui (ON DELETE RESTRICT + soft delete), então a
  -- reversão da meta não pode ser silenciosamente pulada.
  update public.metas
     set status = 'pendente', concluida_em = null
   where id = v_bateria.meta_id and excluido_em is null;

  update public.operacoes
     set resultado = jsonb_build_object('bateria_id', p_bateria_id, 'status', 'anulada')
   where request_id = p_request_id;

  return v_bateria;
end;
$$;


-- -----------------------------------------------------------------------------
-- 7.7 Registrar reforço de ciclo
-- -----------------------------------------------------------------------------
create or replace function public.registrar_reforco(
  p_planejamento_id uuid,
  p_bloco_id        uuid,
  p_baterias        uuid[],
  p_request_id      uuid,
  p_resultados      jsonb
)
returns public.reforcos
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid        uuid := auth.uid();
  v_plan       public.planejamentos%rowtype;
  v_reforco    public.reforcos%rowtype;
  v_reserva    record;
  v_qtd        integer;
  v_principais integer;
  v_acertos    integer;
  v_cutoff     timestamptz;
  v_desempenho smallint;
  v_faltando   integer;
begin
  if v_uid is null then raise exception 'usuario nao autenticado' using errcode='28000'; end if;
  if p_baterias is null or cardinality(p_baterias) <> 3 then
    raise exception 'o reforco de ciclo exige exatamente 3 baterias';
  end if;
  if p_resultados is null or jsonb_typeof(p_resultados) <> 'array' then
    raise exception 'p_resultados deve ser um array JSON';
  end if;

  select * into v_reserva from public.reservar_operacao(
    p_request_id, 'registrar_reforco', p_bloco_id, p_resultados::text
  );
  if not v_reserva.reservada then
    select * into v_reforco from public.reforcos r where r.request_id = p_request_id;
    return v_reforco;
  end if;

  select * into v_plan from public.planejamentos p
   where p.id = p_planejamento_id and p.aluno_id = v_uid and p.excluido_em is null
   for update;
  if not found then raise exception 'planejamento invalido'; end if;

  select count(*), coalesce(sum(d.principais_qtd),0), coalesce(sum(d.principais_acertos),0),
         max(b.concluida_em)
    into v_qtd, v_principais, v_acertos, v_cutoff
  from public.baterias b
  join public.vw_bateria_desempenho d on d.bateria_id = b.id
 where b.id = any(p_baterias)
   and b.planejamento_id = p_planejamento_id
   and b.bloco_id = p_bloco_id
   and b.aluno_id = v_uid
   and b.status = 'concluida';

  if v_qtd <> 3 then
    raise exception 'as 3 baterias precisam estar concluidas e pertencer ao mesmo bloco';
  end if;
  if v_principais <= 0 then raise exception 'ciclo sem questoes principais'; end if;

  v_desempenho := round(100.0 * v_acertos / v_principais)::smallint;
  if v_desempenho >= 80 then
    raise exception 'este ciclo atingiu 80%% e nao exige reforco automatico';
  end if;

  insert into public.reforcos (
    planejamento_id, aluno_id, professor_id, bloco_id,
    request_id, cutoff, desempenho_origem
  ) values (
    p_planejamento_id, v_uid, v_plan.professor_id, p_bloco_id,
    p_request_id, v_cutoff, v_desempenho
  ) returning * into v_reforco;

  -- unique(bateria_id) impede reaproveitar bateria em dois ciclos.
  insert into public.reforco_baterias (reforco_id, bateria_id)
  select v_reforco.id, unnest(p_baterias);

  insert into public.reforco_questoes (reforco_id, questao_id, fase, resultado, topico)
  select v_reforco.id, x.questao_id, x.fase::public.fase_questao,
         x.resultado::public.resultado_questao, nullif(btrim(coalesce(x.topico,'')),'')
  from jsonb_to_recordset(p_resultados) as x(
    questao_id bigint, fase text, resultado text, topico text
  );

  -- Todo erro principal do ciclo precisa ter sido revisado.
  -- Em SQL relacional isto é um EXCEPT; com o jsonb antigo eram quatro blocos
  -- de jsonb_to_recordset.
  select count(*) into v_faltando from (
    select q.questao_id
      from public.bateria_questoes q
      join public.reforco_baterias rb on rb.bateria_id = q.bateria_id
     where rb.reforco_id = v_reforco.id
       and q.fase = 'principal' and q.resultado = 'errou'
    except
    select rq.questao_id from public.reforco_questoes rq
     where rq.reforco_id = v_reforco.id and rq.fase = 'principal'
  ) faltantes;

  if v_faltando > 0 then
    raise exception 'o reforco precisa revisar as % questoes erradas restantes do ciclo', v_faltando;
  end if;

  insert into public.ciclos_revisao (aluno_id, bloco_id, cutoff, reforco_id)
  values (v_uid, p_bloco_id, v_cutoff, v_reforco.id)
  on conflict (aluno_id, bloco_id, cutoff) do nothing;

  update public.operacoes
     set resultado = jsonb_build_object('reforco_id', v_reforco.id)
   where request_id = p_request_id;

  return v_reforco;
end;
$$;


-- =============================================================================
-- 8. GRANTS
-- =============================================================================
-- O client autenticado só LÊ tabelas (filtrado por RLS) e EXECUTA RPCs.
-- Escrita direta existe apenas em aluno_preferencias, que é estado de UI.

revoke all on all tables    in schema public from anon, authenticated;
revoke all on all functions in schema public from anon, authenticated;

grant usage on schema public to anon, authenticated;

grant select on
  public.perfis, public.cupons, public.vinculos_aluno_professor, public.assinaturas,
  public.catalogos, public.catalogo_blocos, public.catalogo_questoes,
  public.planejamentos, public.planejamento_blocos, public.lotes_planejamento,
  public.metas, public.baterias, public.bateria_questoes,
  public.reforcos, public.reforco_baterias, public.reforco_questoes,
  public.ciclos_revisao, public.operacoes, public.auditoria,
  public.vw_bateria_desempenho, public.vw_meta_desempenho,
  public.vw_questoes_vistas, public.vw_bloco_desempenho
to authenticated;

grant select, insert, update on public.perfis          to authenticated;
grant select, insert, update on public.lista_espera    to authenticated;
grant select, insert, update on public.aluno_preferencias to authenticated;

grant execute on function
  public.ativar_planejamento(uuid),
  public.aplicar_lote_planejamento(uuid, uuid, smallint, public.modo_lote, jsonb),
  public.iniciar_bateria(uuid, uuid, uuid),
  public.finalizar_bateria(uuid, uuid, jsonb, boolean),
  public.registrar_tempo_bateria(uuid, uuid, integer),
  public.anular_bateria(uuid, uuid, text),
  public.registrar_reforco(uuid, uuid, uuid[], uuid, jsonb),
  public.eh_professor(),
  public.eh_professor_de(uuid),
  public.pode_ver_contexto(uuid, uuid)
to authenticated;

-- reservar_operacao é infraestrutura interna das RPCs, não API pública.
revoke all on function public.reservar_operacao(uuid, text, uuid, text) from anon, authenticated;

