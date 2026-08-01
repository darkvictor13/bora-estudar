-- Bora Estudar
-- Esquema inicial consolidado para PostgreSQL 17 / Supabase.
-- Todas as exclusões de domínio são lógicas, reversíveis e auditadas.

begin;

create extension if not exists pgcrypto;

create schema if not exists private;
revoke all on schema private from public;

-- -----------------------------------------------------------------------------
-- Tipos do domínio
-- -----------------------------------------------------------------------------

create type public.tipo_perfil as enum ('admin', 'professor', 'aluno');
create type public.status_vinculo as enum ('ativo', 'encerrado');
create type public.status_acesso as enum ('pendente', 'ativo', 'bloqueado', 'expirado', 'cancelado');
create type public.fase_curso as enum ('pre_edital', 'pos_edital');
create type public.modelo_estudo as enum ('teoria_blocos', 'somente_blocos');
create type public.modalidade_disciplina as enum ('blocos', 'teoria', 'ambos');
create type public.status_planejamento as enum ('ativo', 'pausado', 'arquivado');
create type public.tipo_meta as enum ('bloco', 'teoria', 'reforco', 'extra');
create type public.status_meta as enum ('pendente', 'em_andamento', 'concluida', 'pulada', 'cancelada');
create type public.tipo_material as enum ('pdf', 'video', 'link', 'outro');
create type public.etapa_revisao as enum ('primeira', 'segunda');
create type public.status_revisao as enum ('pendente', 'concluida', 'cancelada');
create type public.status_lista_espera as enum ('aguardando', 'contatado', 'convertido', 'cancelado');

create or replace function public.soft_delete_metadata_valid(
  p_deleted_at timestamptz,
  p_deleted_by uuid,
  p_delete_reason text,
  p_delete_operation_id uuid
)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select
    (
      p_deleted_at is null
      and p_deleted_by is null
      and p_delete_reason is null
      and p_delete_operation_id is null
    )
    or
    (
      p_deleted_at is not null
      and p_deleted_by is not null
      and length(btrim(coalesce(p_delete_reason, ''))) > 0
      and p_delete_operation_id is not null
    );
$$;

-- -----------------------------------------------------------------------------
-- Usuários e auditoria
-- -----------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users(id) on delete restrict,
  nome text not null,
  tipo public.tipo_perfil not null default 'aluno',
  telefone text,
  fuso_horario text not null default 'America/Sao_Paulo',
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references public.profiles(id) on delete restrict,
  delete_reason text,
  delete_operation_id uuid,
  constraint ck_profiles_nome check (nome = btrim(nome) and length(nome) >= 2),
  constraint ck_profiles_telefone check (telefone is null or telefone = btrim(telefone)),
  constraint ck_profiles_fuso check (fuso_horario = btrim(fuso_horario) and length(fuso_horario) > 0),
  constraint ck_profiles_soft_delete check (
    public.soft_delete_metadata_valid(deleted_at, deleted_by, delete_reason, delete_operation_id)
  )
);

create table public.audit_events (
  id uuid primary key default gen_random_uuid(),
  operation_id uuid not null default gen_random_uuid(),
  table_name text not null,
  record_id uuid not null,
  action text not null check (action in ('insert', 'update', 'soft_delete', 'restore')),
  actor_id uuid references public.profiles(id) on delete restrict,
  reason text,
  before_data jsonb,
  after_data jsonb,
  created_at timestamptz not null default now()
);

create index ix_audit_events_record
  on public.audit_events (table_name, record_id, created_at desc);
create index ix_audit_events_operation
  on public.audit_events (operation_id, created_at);

-- -----------------------------------------------------------------------------
-- Vínculos e acesso
-- -----------------------------------------------------------------------------

create table public.professor_alunos (
  id uuid primary key default gen_random_uuid(),
  professor_id uuid not null references public.profiles(id) on delete restrict,
  aluno_id uuid not null references public.profiles(id) on delete restrict,
  status public.status_vinculo not null default 'ativo',
  inicio_em date not null default current_date,
  fim_em date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references public.profiles(id) on delete restrict,
  delete_reason text,
  delete_operation_id uuid,
  constraint ck_professor_aluno_distintos check (professor_id <> aluno_id),
  constraint ck_vinculo_datas check (fim_em is null or fim_em >= inicio_em),
  constraint ck_vinculo_estado_data check (
    (status = 'ativo' and fim_em is null)
    or (status = 'encerrado' and fim_em is not null)
  ),
  constraint ck_professor_alunos_soft_delete check (
    public.soft_delete_metadata_valid(deleted_at, deleted_by, delete_reason, delete_operation_id)
  )
);

create unique index uq_professor_alunos_vinculo_ativo
  on public.professor_alunos (aluno_id)
  where status = 'ativo' and deleted_at is null;
create index ix_professor_alunos_professor
  on public.professor_alunos (professor_id, status)
  where deleted_at is null;
create index ix_professor_alunos_historico
  on public.professor_alunos (professor_id, aluno_id, inicio_em, fim_em);

create table public.acessos_aluno (
  id uuid primary key default gen_random_uuid(),
  aluno_id uuid not null references public.profiles(id) on delete restrict,
  status public.status_acesso not null default 'pendente',
  plano text not null default 'manual',
  inicio_em date,
  expira_em date,
  bloqueado_em timestamptz,
  motivo_bloqueio text,
  liberado_por uuid references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references public.profiles(id) on delete restrict,
  delete_reason text,
  delete_operation_id uuid,
  constraint ck_acesso_plano check (plano = btrim(plano) and length(plano) > 0),
  constraint ck_acesso_datas check (
    expira_em is null or inicio_em is null or expira_em >= inicio_em
  ),
  constraint ck_acesso_ativo_inicio check (status <> 'ativo' or inicio_em is not null),
  constraint ck_acesso_bloqueio check (
    (status = 'bloqueado' and bloqueado_em is not null)
    or (status <> 'bloqueado' and bloqueado_em is null and motivo_bloqueio is null)
  ),
  constraint ck_acessos_aluno_soft_delete check (
    public.soft_delete_metadata_valid(deleted_at, deleted_by, delete_reason, delete_operation_id)
  )
);

create unique index uq_acesso_corrente_aluno
  on public.acessos_aluno (aluno_id)
  where status in ('pendente', 'ativo', 'bloqueado') and deleted_at is null;
create index ix_acessos_aluno_status_expiracao
  on public.acessos_aluno (aluno_id, status, expira_em)
  where deleted_at is null;

-- -----------------------------------------------------------------------------
-- Catálogo acadêmico
-- -----------------------------------------------------------------------------

create table public.cursos (
  id uuid primary key default gen_random_uuid(),
  codigo text not null,
  nome text not null,
  area text,
  concurso_alvo text,
  fase public.fase_curso not null default 'pre_edital',
  modelo_estudo public.modelo_estudo not null default 'teoria_blocos',
  metas_semanais_padrao integer not null default 24
    check (metas_semanais_padrao between 1 and 100),
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references public.profiles(id) on delete restrict,
  delete_reason text,
  delete_operation_id uuid,
  constraint ck_cursos_codigo check (codigo = btrim(codigo) and length(codigo) > 0),
  constraint ck_cursos_nome check (nome = btrim(nome) and length(nome) > 0),
  constraint ck_cursos_soft_delete check (
    public.soft_delete_metadata_valid(deleted_at, deleted_by, delete_reason, delete_operation_id)
  )
);

create unique index uq_cursos_codigo_normalizado
  on public.cursos (lower(btrim(codigo))) where deleted_at is null;

create table public.disciplinas (
  id uuid primary key default gen_random_uuid(),
  codigo text not null,
  nome text not null,
  -- Cor explícita é opcional. NULL delega a cor padrão à aplicação/tema.
  cor varchar(7) check (cor is null or cor ~ '^#[0-9A-Fa-f]{6}$'),
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references public.profiles(id) on delete restrict,
  delete_reason text,
  delete_operation_id uuid,
  constraint ck_disciplinas_codigo check (codigo = btrim(codigo) and length(codigo) > 0),
  constraint ck_disciplinas_nome check (nome = btrim(nome) and length(nome) > 0),
  constraint ck_disciplinas_soft_delete check (
    public.soft_delete_metadata_valid(deleted_at, deleted_by, delete_reason, delete_operation_id)
  )
);

create unique index uq_disciplinas_codigo_normalizado
  on public.disciplinas (lower(btrim(codigo))) where deleted_at is null;

create table public.curso_disciplinas (
  id uuid primary key default gen_random_uuid(),
  curso_id uuid not null references public.cursos(id) on delete restrict,
  disciplina_id uuid not null references public.disciplinas(id) on delete restrict,
  modalidade public.modalidade_disciplina not null default 'blocos',
  meta_padrao numeric(5,2) not null default 80 check (meta_padrao between 0 and 100),
  peso_padrao numeric(8,2) not null default 1 check (peso_padrao > 0),
  ordem integer not null default 0 check (ordem >= 0),
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references public.profiles(id) on delete restrict,
  delete_reason text,
  delete_operation_id uuid,
  constraint ck_curso_disciplinas_soft_delete check (
    public.soft_delete_metadata_valid(deleted_at, deleted_by, delete_reason, delete_operation_id)
  )
);

create unique index uq_curso_disciplinas_vigente
  on public.curso_disciplinas (curso_id, disciplina_id) where deleted_at is null;
create unique index uq_curso_disciplinas_ordem
  on public.curso_disciplinas (curso_id, ordem) where deleted_at is null;

create table public.cadernos_catalogo (
  id uuid primary key default gen_random_uuid(),
  curso_disciplina_id uuid not null references public.curso_disciplinas(id) on delete restrict,
  nome text not null,
  link_tec text,
  total_questoes integer not null default 0 check (total_questoes >= 0),
  ordem integer not null default 0 check (ordem >= 0),
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references public.profiles(id) on delete restrict,
  delete_reason text,
  delete_operation_id uuid,
  constraint ck_cadernos_catalogo_nome check (nome = btrim(nome) and length(nome) > 0),
  constraint ck_cadernos_catalogo_soft_delete check (
    public.soft_delete_metadata_valid(deleted_at, deleted_by, delete_reason, delete_operation_id)
  )
);

create unique index uq_cadernos_catalogo_ordem
  on public.cadernos_catalogo (curso_disciplina_id, ordem) where deleted_at is null;

create table public.aulas_catalogo (
  id uuid primary key default gen_random_uuid(),
  curso_disciplina_id uuid not null references public.curso_disciplinas(id) on delete restrict,
  nome text not null,
  ordem integer not null default 0 check (ordem >= 0),
  link_tec text,
  total_questoes integer not null default 0 check (total_questoes >= 0),
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references public.profiles(id) on delete restrict,
  delete_reason text,
  delete_operation_id uuid,
  constraint ck_aulas_catalogo_nome check (nome = btrim(nome) and length(nome) > 0),
  constraint ck_aulas_catalogo_soft_delete check (
    public.soft_delete_metadata_valid(deleted_at, deleted_by, delete_reason, delete_operation_id)
  )
);

create unique index uq_aulas_catalogo_ordem
  on public.aulas_catalogo (curso_disciplina_id, ordem) where deleted_at is null;

create table public.materiais_aula (
  id uuid primary key default gen_random_uuid(),
  aula_id uuid not null references public.aulas_catalogo(id) on delete restrict,
  tipo public.tipo_material not null default 'pdf',
  nome text not null,
  url text,
  ordem integer not null default 0 check (ordem >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references public.profiles(id) on delete restrict,
  delete_reason text,
  delete_operation_id uuid,
  constraint ck_materiais_aula_nome check (nome = btrim(nome) and length(nome) > 0),
  constraint ck_materiais_aula_url check (
    tipo = 'outro' or (url is not null and length(btrim(url)) > 0)
  ),
  constraint ck_materiais_aula_soft_delete check (
    public.soft_delete_metadata_valid(deleted_at, deleted_by, delete_reason, delete_operation_id)
  )
);

create unique index uq_materiais_aula_ordem
  on public.materiais_aula (aula_id, ordem) where deleted_at is null;

-- -----------------------------------------------------------------------------
-- Planejamentos e snapshots configuráveis
-- -----------------------------------------------------------------------------

create table public.planejamentos (
  id uuid primary key default gen_random_uuid(),
  professor_id uuid not null references public.profiles(id) on delete restrict,
  aluno_id uuid not null references public.profiles(id) on delete restrict,
  curso_id uuid not null references public.cursos(id) on delete restrict,
  curso_codigo_snapshot text not null,
  curso_nome_snapshot text not null,
  nome text not null,
  fase public.fase_curso not null default 'pre_edital',
  modelo_estudo public.modelo_estudo not null default 'teoria_blocos',
  metas_semanais integer not null default 24 check (metas_semanais between 1 and 100),
  data_inicio date not null default current_date,
  status public.status_planejamento not null default 'ativo',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references public.profiles(id) on delete restrict,
  delete_reason text,
  delete_operation_id uuid,
  constraint ck_planejamentos_nome check (nome = btrim(nome) and length(nome) > 0),
  constraint ck_planejamentos_snapshot check (
    curso_codigo_snapshot = btrim(curso_codigo_snapshot)
    and length(curso_codigo_snapshot) > 0
    and curso_nome_snapshot = btrim(curso_nome_snapshot)
    and length(curso_nome_snapshot) > 0
  ),
  constraint ck_planejamentos_soft_delete check (
    public.soft_delete_metadata_valid(deleted_at, deleted_by, delete_reason, delete_operation_id)
  )
);

create unique index uq_planejamentos_nome_normalizado
  on public.planejamentos (aluno_id, lower(btrim(nome))) where deleted_at is null;
create unique index uq_planejamento_ativo_aluno
  on public.planejamentos (aluno_id)
  where status = 'ativo' and deleted_at is null;
create index ix_planejamentos_professor_aluno
  on public.planejamentos (professor_id, aluno_id, status)
  where deleted_at is null;

create table public.planejamento_disciplinas (
  id uuid primary key default gen_random_uuid(),
  planejamento_id uuid not null references public.planejamentos(id) on delete restrict,
  curso_disciplina_id uuid not null references public.curso_disciplinas(id) on delete restrict,
  disciplina_id uuid not null references public.disciplinas(id) on delete restrict,
  disciplina_codigo_snapshot text not null,
  disciplina_nome_snapshot text not null,
  disciplina_cor_snapshot varchar(7)
    check (disciplina_cor_snapshot is null or disciplina_cor_snapshot ~ '^#[0-9A-Fa-f]{6}$'),
  modalidade public.modalidade_disciplina not null default 'blocos',
  meta_percentual numeric(5,2) not null default 80 check (meta_percentual between 0 and 100),
  peso numeric(8,2) not null default 1 check (peso > 0),
  minimo_metas integer not null default 0 check (minimo_metas >= 0),
  maximo_metas integer not null default 8 check (maximo_metas >= 0),
  ordem integer not null default 0 check (ordem >= 0),
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references public.profiles(id) on delete restrict,
  delete_reason text,
  delete_operation_id uuid,
  constraint ck_planejamento_disciplina_limites check (maximo_metas >= minimo_metas),
  constraint ck_planejamento_disciplinas_snapshot check (
    disciplina_codigo_snapshot = btrim(disciplina_codigo_snapshot)
    and length(disciplina_codigo_snapshot) > 0
    and disciplina_nome_snapshot = btrim(disciplina_nome_snapshot)
    and length(disciplina_nome_snapshot) > 0
  ),
  constraint ck_planejamento_disciplinas_soft_delete check (
    public.soft_delete_metadata_valid(deleted_at, deleted_by, delete_reason, delete_operation_id)
  )
);

create unique index uq_planejamento_disciplinas_vigente
  on public.planejamento_disciplinas (planejamento_id, disciplina_id)
  where deleted_at is null;
create unique index uq_planejamento_disciplinas_ordem
  on public.planejamento_disciplinas (planejamento_id, ordem)
  where deleted_at is null;

create table public.planejamento_cadernos (
  id uuid primary key default gen_random_uuid(),
  planejamento_disciplina_id uuid not null references public.planejamento_disciplinas(id) on delete restrict,
  caderno_catalogo_id uuid references public.cadernos_catalogo(id) on delete restrict,
  nome text not null,
  link_tec text,
  total_questoes integer not null default 0 check (total_questoes >= 0),
  ordem integer not null default 0 check (ordem >= 0),
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references public.profiles(id) on delete restrict,
  delete_reason text,
  delete_operation_id uuid,
  constraint ck_planejamento_cadernos_nome check (nome = btrim(nome) and length(nome) > 0),
  constraint ck_planejamento_cadernos_soft_delete check (
    public.soft_delete_metadata_valid(deleted_at, deleted_by, delete_reason, delete_operation_id)
  )
);

create unique index uq_planejamento_cadernos_ordem
  on public.planejamento_cadernos (planejamento_disciplina_id, ordem)
  where deleted_at is null;
create index ix_planejamento_cadernos_elegiveis
  on public.planejamento_cadernos (planejamento_disciplina_id, ordem)
  where ativo = true and deleted_at is null;

create table public.planejamento_aulas (
  id uuid primary key default gen_random_uuid(),
  planejamento_disciplina_id uuid not null references public.planejamento_disciplinas(id) on delete restrict,
  aula_catalogo_id uuid references public.aulas_catalogo(id) on delete restrict,
  nome text not null,
  ordem integer not null default 0 check (ordem >= 0),
  link_tec text,
  total_questoes integer not null default 0 check (total_questoes >= 0),
  materiais_snapshot jsonb not null default '[]'::jsonb,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references public.profiles(id) on delete restrict,
  delete_reason text,
  delete_operation_id uuid,
  constraint ck_planejamento_aulas_nome check (nome = btrim(nome) and length(nome) > 0),
  constraint ck_planejamento_aulas_materiais check (jsonb_typeof(materiais_snapshot) = 'array'),
  constraint ck_planejamento_aulas_soft_delete check (
    public.soft_delete_metadata_valid(deleted_at, deleted_by, delete_reason, delete_operation_id)
  )
);

create unique index uq_planejamento_aulas_ordem
  on public.planejamento_aulas (planejamento_disciplina_id, ordem)
  where deleted_at is null;

-- -----------------------------------------------------------------------------
-- Metas, resultados e estudos extras
-- -----------------------------------------------------------------------------

create table public.metas (
  id uuid primary key default gen_random_uuid(),
  planejamento_id uuid not null references public.planejamentos(id) on delete restrict,
  planejamento_disciplina_id uuid references public.planejamento_disciplinas(id) on delete restrict,
  planejamento_caderno_id uuid references public.planejamento_cadernos(id) on delete restrict,
  origem_meta_id uuid references public.metas(id) on delete restrict,
  tipo public.tipo_meta not null,
  titulo text not null,
  descricao text,
  atividade_extra text,
  semana_numero integer not null check (semana_numero >= 1),
  dia_semana smallint not null check (dia_semana between 1 and 7),
  ordem_dia integer not null check (ordem_dia >= 1),
  tempo_previsto_minutos integer not null default 60
    check (tempo_previsto_minutos between 1 and 240),
  tempo_gasto_minutos integer check (tempo_gasto_minutos between 1 and 1440),
  questoes_feitas integer not null default 0 check (questoes_feitas >= 0),
  acertos integer not null default 0 check (acertos >= 0 and acertos <= questoes_feitas),
  observacao_conclusao text,
  status public.status_meta not null default 'pendente',
  concluida_em timestamptz,
  reforco_ignorado_em timestamptz,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references public.profiles(id) on delete restrict,
  delete_reason text,
  delete_operation_id uuid,
  constraint ck_metas_titulo check (titulo = btrim(titulo) and length(titulo) > 0),
  constraint ck_meta_tipo_referencias check (
    (tipo = 'bloco' and planejamento_disciplina_id is not null and planejamento_caderno_id is not null and origem_meta_id is null and atividade_extra is null)
    or (tipo = 'teoria' and planejamento_disciplina_id is not null and planejamento_caderno_id is null and origem_meta_id is null and atividade_extra is null)
    or (tipo = 'reforco' and planejamento_disciplina_id is not null and origem_meta_id is not null and atividade_extra is null)
    or (tipo = 'extra' and planejamento_disciplina_id is null and planejamento_caderno_id is null and origem_meta_id is null and length(btrim(atividade_extra)) > 0)
  ),
  constraint ck_meta_conclusao check (
    (status = 'concluida' and concluida_em is not null and tempo_gasto_minutos is not null)
    or (status <> 'concluida' and concluida_em is null and tempo_gasto_minutos is null and observacao_conclusao is null)
  ),
  constraint ck_meta_questoes_conclusao check (
    status <> 'concluida' or tipo in ('teoria', 'extra') or questoes_feitas > 0
  ),
  constraint ck_meta_extra_sem_questoes check (
    tipo <> 'extra' or (questoes_feitas = 0 and acertos = 0)
  ),
  constraint ck_metas_soft_delete check (
    public.soft_delete_metadata_valid(deleted_at, deleted_by, delete_reason, delete_operation_id)
  )
);

create unique index uq_metas_agenda
  on public.metas (planejamento_id, semana_numero, dia_semana, ordem_dia)
  where deleted_at is null;
create index ix_metas_planejamento_agenda
  on public.metas (planejamento_id, semana_numero, dia_semana, ordem_dia)
  where deleted_at is null;
create index ix_metas_planejamento_status
  on public.metas (planejamento_id, status, tipo)
  where deleted_at is null;
create unique index uq_reforco_pendente_origem
  on public.metas (origem_meta_id)
  where tipo = 'reforco'
    and status in ('pendente', 'em_andamento')
    and deleted_at is null;

create table public.meta_resultados (
  id uuid primary key default gen_random_uuid(),
  meta_id uuid not null references public.metas(id) on delete restrict,
  tentativa_numero integer not null check (tentativa_numero >= 1),
  tempo_gasto_minutos integer not null check (tempo_gasto_minutos between 1 and 1440),
  questoes_feitas integer not null default 0 check (questoes_feitas >= 0),
  acertos integer not null default 0 check (acertos >= 0 and acertos <= questoes_feitas),
  observacao text,
  concluida_em timestamptz not null default now(),
  created_by uuid not null references public.profiles(id) on delete restrict,
  desfeita_em timestamptz,
  desfeita_por uuid references public.profiles(id) on delete restrict,
  motivo_desfazer text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ck_meta_resultado_desfeito check (
    (desfeita_em is null and desfeita_por is null and motivo_desfazer is null)
    or (
      desfeita_em is not null
      and desfeita_por is not null
      and length(btrim(coalesce(motivo_desfazer, ''))) > 0
    )
  ),
  unique (meta_id, tentativa_numero)
);

create unique index uq_meta_resultado_vigente
  on public.meta_resultados (meta_id) where desfeita_em is null;

-- -----------------------------------------------------------------------------
-- Aulas, revisões e lista de espera
-- -----------------------------------------------------------------------------

create table public.progresso_aulas (
  id uuid primary key default gen_random_uuid(),
  planejamento_aula_id uuid not null references public.planejamento_aulas(id) on delete restrict,
  aluno_id uuid not null references public.profiles(id) on delete restrict,
  teoria_concluida_em timestamptz,
  caderno_concluido_em timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references public.profiles(id) on delete restrict,
  delete_reason text,
  delete_operation_id uuid,
  constraint ck_progresso_aulas_soft_delete check (
    public.soft_delete_metadata_valid(deleted_at, deleted_by, delete_reason, delete_operation_id)
  )
);

create unique index uq_progresso_aula_aluno
  on public.progresso_aulas (planejamento_aula_id, aluno_id)
  where deleted_at is null;

create table public.configuracoes_revisao (
  id uuid primary key default gen_random_uuid(),
  planejamento_disciplina_id uuid not null references public.planejamento_disciplinas(id) on delete restrict,
  primeira_revisao_intervalo integer not null default 0
    check (primeira_revisao_intervalo between 0 and 60),
  segunda_revisao_intervalo integer not null default 0
    check (segunda_revisao_intervalo between 0 and 60),
  ativo boolean not null default true,
  updated_by uuid references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references public.profiles(id) on delete restrict,
  delete_reason text,
  delete_operation_id uuid,
  constraint ck_configuracoes_revisao_soft_delete check (
    public.soft_delete_metadata_valid(deleted_at, deleted_by, delete_reason, delete_operation_id)
  )
);

create unique index uq_configuracao_revisao_vigente
  on public.configuracoes_revisao (planejamento_disciplina_id)
  where deleted_at is null;

create table public.revisoes (
  id uuid primary key default gen_random_uuid(),
  planejamento_aula_origem_id uuid not null references public.planejamento_aulas(id) on delete restrict,
  planejamento_aula_revisada_id uuid not null references public.planejamento_aulas(id) on delete restrict,
  aluno_id uuid not null references public.profiles(id) on delete restrict,
  etapa public.etapa_revisao not null,
  status public.status_revisao not null default 'pendente',
  prevista_em date,
  concluida_em timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references public.profiles(id) on delete restrict,
  delete_reason text,
  delete_operation_id uuid,
  constraint ck_revisao_aulas_distintas check (planejamento_aula_origem_id <> planejamento_aula_revisada_id),
  constraint ck_revisao_conclusao check (
    (status = 'concluida' and concluida_em is not null)
    or (status <> 'concluida' and concluida_em is null)
  ),
  constraint ck_revisoes_soft_delete check (
    public.soft_delete_metadata_valid(deleted_at, deleted_by, delete_reason, delete_operation_id)
  )
);

create unique index uq_revisao_vigente
  on public.revisoes (
    planejamento_aula_origem_id,
    planejamento_aula_revisada_id,
    aluno_id,
    etapa
  ) where deleted_at is null;

create table public.lista_espera (
  id uuid primary key default gen_random_uuid(),
  aluno_id uuid not null references public.profiles(id) on delete restrict,
  professor_id uuid references public.profiles(id) on delete restrict,
  whatsapp text not null,
  area_interesse text not null,
  concurso_foco text not null,
  status public.status_lista_espera not null default 'aguardando',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references public.profiles(id) on delete restrict,
  delete_reason text,
  delete_operation_id uuid,
  constraint ck_lista_espera_campos check (
    whatsapp = btrim(whatsapp) and length(whatsapp) > 0
    and area_interesse = btrim(area_interesse) and length(area_interesse) > 0
    and concurso_foco = btrim(concurso_foco) and length(concurso_foco) > 0
  ),
  constraint ck_lista_espera_soft_delete check (
    public.soft_delete_metadata_valid(deleted_at, deleted_by, delete_reason, delete_operation_id)
  )
);

create unique index uq_lista_espera_aluno
  on public.lista_espera (aluno_id) where deleted_at is null;

-- -----------------------------------------------------------------------------
-- Infraestrutura de atualização, auditoria e bloqueio de hard delete
-- -----------------------------------------------------------------------------

create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create or replace function private.prevent_hard_delete()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'hard delete bloqueado em %. Use a RPC de soft delete.', tg_table_name
    using errcode = 'P0001';
end;
$$;

create or replace function private.guard_soft_delete_update()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_old_payload jsonb;
  v_new_payload jsonb;
begin
  v_old_payload := to_jsonb(old) - array[
    'deleted_at', 'deleted_by', 'delete_reason', 'delete_operation_id', 'updated_at'
  ];
  v_new_payload := to_jsonb(new) - array[
    'deleted_at', 'deleted_by', 'delete_reason', 'delete_operation_id', 'updated_at'
  ];

  if old.deleted_at is not null and new.deleted_at is not null then
    raise exception 'registro excluído é imutável; restaure-o antes de alterar';
  end if;

  if old.deleted_at is distinct from new.deleted_at and v_old_payload <> v_new_payload then
    raise exception 'soft delete/restauração não pode alterar os dados de domínio na mesma operação';
  end if;

  return new;
end;
$$;

create or replace function private.audit_row_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_action text;
  v_reason text;
  v_operation_id uuid;
begin
  if tg_op = 'INSERT' then
    v_action := 'insert';
    v_reason := nullif(current_setting('app.audit_reason', true), '');
    v_operation_id := coalesce(
      nullif(current_setting('app.audit_operation_id', true), '')::uuid,
      gen_random_uuid()
    );
  elsif old.deleted_at is null and new.deleted_at is not null then
    v_action := 'soft_delete';
    v_reason := new.delete_reason;
    v_operation_id := new.delete_operation_id;
  elsif old.deleted_at is not null and new.deleted_at is null then
    v_action := 'restore';
    v_reason := nullif(current_setting('app.audit_reason', true), '');
    v_operation_id := coalesce(
      nullif(current_setting('app.audit_operation_id', true), '')::uuid,
      gen_random_uuid()
    );
  else
    v_action := 'update';
    v_reason := nullif(current_setting('app.audit_reason', true), '');
    v_operation_id := coalesce(
      nullif(current_setting('app.audit_operation_id', true), '')::uuid,
      gen_random_uuid()
    );
  end if;

  insert into public.audit_events (
    operation_id,
    table_name,
    record_id,
    action,
    actor_id,
    reason,
    before_data,
    after_data
  ) values (
    v_operation_id,
    tg_table_name,
    new.id,
    v_action,
    auth.uid(),
    v_reason,
    case when tg_op = 'INSERT' then null else to_jsonb(old) end,
    to_jsonb(new)
  );

  return new;
end;
$$;

create or replace function private.audit_append_only_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.audit_events (
    operation_id,
    table_name,
    record_id,
    action,
    actor_id,
    reason,
    before_data,
    after_data
  ) values (
    coalesce(
      nullif(current_setting('app.audit_operation_id', true), '')::uuid,
      gen_random_uuid()
    ),
    tg_table_name,
    new.id,
    case when tg_op = 'INSERT' then 'insert' else 'update' end,
    auth.uid(),
    nullif(current_setting('app.audit_reason', true), ''),
    case when tg_op = 'INSERT' then null else to_jsonb(old) end,
    to_jsonb(new)
  );
  return new;
end;
$$;

create or replace function private.prevent_audit_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'eventos de auditoria são imutáveis';
end;
$$;

create or replace function private.guard_meta_resultado_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.desfeita_em is not null then
    raise exception 'resultado acadêmico desfeito é imutável';
  end if;

  if new.desfeita_em is null
     or new.desfeita_por is null
     or length(btrim(coalesce(new.motivo_desfazer, ''))) = 0 then
    raise exception 'resultado somente pode ser atualizado para registrar o desfazimento';
  end if;

  if (
    to_jsonb(old) - array['desfeita_em', 'desfeita_por', 'motivo_desfazer', 'updated_at']
  ) <> (
    to_jsonb(new) - array['desfeita_em', 'desfeita_por', 'motivo_desfazer', 'updated_at']
  ) then
    raise exception 'dados históricos do resultado não podem ser sobrescritos';
  end if;

  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- Validações relacionais e de estados
-- -----------------------------------------------------------------------------

create or replace function private.validar_vinculo_professor_aluno()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.deleted_at is not null then
    return new;
  end if;

  if not exists (
    select 1
    from public.profiles
    where id = new.professor_id
      and tipo = 'professor'
      and ativo
      and deleted_at is null
  ) then
    raise exception 'professor_id não referencia professor ativo e vigente';
  end if;

  if not exists (
    select 1
    from public.profiles
    where id = new.aluno_id
      and tipo = 'aluno'
      and ativo
      and deleted_at is null
  ) then
    raise exception 'aluno_id não referencia aluno ativo e vigente';
  end if;

  return new;
end;
$$;

create or replace function private.validar_transicao_vinculo()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.deleted_at is distinct from new.deleted_at or old.status = new.status then
    return new;
  end if;

  if old.status <> 'ativo' or new.status <> 'encerrado' then
    raise exception 'vínculo encerrado é histórico e não pode ser reativado';
  end if;

  return new;
end;
$$;

create or replace function private.validar_acesso_aluno()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.deleted_at is not null then
    return new;
  end if;

  if not exists (
    select 1
    from public.profiles
    where id = new.aluno_id
      and tipo = 'aluno'
      and ativo
      and deleted_at is null
  ) then
    raise exception 'acesso deve pertencer a aluno ativo e vigente';
  end if;

  return new;
end;
$$;

create or replace function private.validar_transicao_acesso()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.deleted_at is distinct from new.deleted_at or old.status = new.status then
    return new;
  end if;

  if not (
    (old.status = 'pendente' and new.status in ('ativo', 'bloqueado', 'expirado', 'cancelado'))
    or (old.status = 'ativo' and new.status in ('bloqueado', 'expirado', 'cancelado'))
    or (old.status = 'bloqueado' and new.status in ('ativo', 'expirado', 'cancelado'))
  ) then
    raise exception 'transição de acesso inválida: % -> %', old.status, new.status;
  end if;

  return new;
end;
$$;

create or replace function private.validar_curso_disciplina()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_modelo public.modelo_estudo;
begin
  if new.deleted_at is not null then
    return new;
  end if;

  select modelo_estudo into v_modelo
  from public.cursos
  where id = new.curso_id and ativo and deleted_at is null;

  if v_modelo is null then
    raise exception 'curso não está ativo ou vigente';
  end if;

  if not exists (
    select 1 from public.disciplinas
    where id = new.disciplina_id and ativo and deleted_at is null
  ) then
    raise exception 'disciplina não está ativa ou vigente';
  end if;

  if v_modelo = 'somente_blocos' and new.modalidade <> 'blocos' then
    raise exception 'curso somente_blocos aceita apenas modalidade blocos';
  end if;

  return new;
end;
$$;

create or replace function private.validar_item_catalogo()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_parent_id uuid;
begin
  if new.deleted_at is not null then
    return new;
  end if;

  if tg_table_name in ('cadernos_catalogo', 'aulas_catalogo') then
    v_parent_id := new.curso_disciplina_id;
    if not exists (
      select 1 from public.curso_disciplinas
      where id = v_parent_id and ativo and deleted_at is null
    ) then
      raise exception 'curso_disciplina do item não está ativo ou vigente';
    end if;
  elsif tg_table_name = 'materiais_aula' then
    v_parent_id := new.aula_id;
    if not exists (
      select 1 from public.aulas_catalogo
      where id = v_parent_id and ativo and deleted_at is null
    ) then
      raise exception 'aula do material não está ativa ou vigente';
    end if;
  end if;

  return new;
end;
$$;

create or replace function private.validar_planejamento()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_curso public.cursos;
begin
  if new.deleted_at is not null then
    return new;
  end if;

  select * into v_curso
  from public.cursos
  where id = new.curso_id;

  if v_curso.id is null then
    raise exception 'curso do planejamento não existe ou está excluído';
  end if;

  if tg_op = 'INSERT' or new.curso_id is distinct from old.curso_id then
    if not v_curso.ativo or v_curso.deleted_at is not null then
      raise exception 'novo planejamento exige curso ativo';
    end if;
    new.curso_codigo_snapshot := v_curso.codigo;
    new.curso_nome_snapshot := v_curso.nome;
  end if;

  if tg_op = 'INSERT'
     or new.professor_id is distinct from old.professor_id
     or new.aluno_id is distinct from old.aluno_id then
    if not exists (
      select 1
      from public.professor_alunos
      where professor_id = new.professor_id
        and aluno_id = new.aluno_id
        and status = 'ativo'
        and deleted_at is null
    ) then
      raise exception 'professor e aluno não possuem vínculo ativo';
    end if;
  end if;

  if new.status = 'ativo' then
    perform pg_advisory_xact_lock(hashtextextended(new.aluno_id::text, 0));

    if not exists (
      select 1 from public.professor_alunos
      where aluno_id = new.aluno_id
        and status = 'ativo'
        and deleted_at is null
    ) then
      raise exception 'planejamento ativo exige vínculo ativo para o aluno';
    end if;

    update public.planejamentos
       set status = 'arquivado'
     where aluno_id = new.aluno_id
       and id <> new.id
       and status = 'ativo'
       and deleted_at is null;
  end if;

  return new;
end;
$$;

create or replace function private.validar_planejamento_disciplina()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_planejamento public.planejamentos;
  v_curso_disciplina public.curso_disciplinas;
  v_disciplina public.disciplinas;
  v_newly_active boolean;
begin
  if new.deleted_at is not null then
    return new;
  end if;

  v_newly_active := tg_op = 'INSERT'
    or (tg_op = 'UPDATE' and old.deleted_at is not null and new.deleted_at is null)
    or (tg_op = 'UPDATE' and new.curso_disciplina_id is distinct from old.curso_disciplina_id);

  select * into v_planejamento
  from public.planejamentos
  where id = new.planejamento_id and deleted_at is null;

  select * into v_curso_disciplina
  from public.curso_disciplinas
  where id = new.curso_disciplina_id;

  if v_planejamento.id is null or v_curso_disciplina.id is null then
    raise exception 'planejamento ou curso_disciplina não existe ou está excluído';
  end if;

  if v_curso_disciplina.curso_id <> v_planejamento.curso_id then
    raise exception 'disciplina não pertence ao curso do planejamento';
  end if;

  select * into v_disciplina
  from public.disciplinas
  where id = v_curso_disciplina.disciplina_id;

  if v_disciplina.id is null then
    raise exception 'disciplina de catálogo não existe ou está excluída';
  end if;

  if v_newly_active and (
    not v_curso_disciplina.ativo
    or v_curso_disciplina.deleted_at is not null
    or not v_disciplina.ativo
    or v_disciplina.deleted_at is not null
  ) then
    raise exception 'nova disciplina do planejamento exige catálogo ativo e vigente';
  end if;

  if tg_op = 'INSERT'
     or new.curso_disciplina_id is distinct from old.curso_disciplina_id then
    new.disciplina_id := v_disciplina.id;
    new.disciplina_codigo_snapshot := v_disciplina.codigo;
    new.disciplina_nome_snapshot := v_disciplina.nome;
    new.disciplina_cor_snapshot := v_disciplina.cor;
  elsif new.disciplina_id <> v_curso_disciplina.disciplina_id then
    raise exception 'disciplina_id diverge de curso_disciplina_id';
  end if;

  if v_planejamento.modelo_estudo = 'somente_blocos' and new.modalidade <> 'blocos' then
    raise exception 'planejamento somente_blocos aceita apenas modalidade blocos';
  end if;

  return new;
end;
$$;

create or replace function private.validar_planejamento_caderno()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.deleted_at is not null then
    return new;
  end if;

  if not exists (
    select 1
    from public.planejamento_disciplinas pd
    join public.planejamentos p on p.id = pd.planejamento_id
    where pd.id = new.planejamento_disciplina_id
      and pd.deleted_at is null
      and p.deleted_at is null
  ) then
    raise exception 'disciplina do caderno não existe ou está excluída';
  end if;

  if new.caderno_catalogo_id is not null and not exists (
    select 1
    from public.planejamento_disciplinas pd
    join public.cadernos_catalogo cc
      on cc.curso_disciplina_id = pd.curso_disciplina_id
    where pd.id = new.planejamento_disciplina_id
      and cc.id = new.caderno_catalogo_id
  ) then
    raise exception 'caderno de catálogo não pertence à disciplina do planejamento';
  end if;

  return new;
end;
$$;

create or replace function private.validar_planejamento_aula()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.deleted_at is not null then
    return new;
  end if;

  if not exists (
    select 1
    from public.planejamento_disciplinas pd
    join public.planejamentos p on p.id = pd.planejamento_id
    where pd.id = new.planejamento_disciplina_id
      and pd.deleted_at is null
      and p.deleted_at is null
  ) then
    raise exception 'disciplina da aula não existe ou está excluída';
  end if;

  if new.aula_catalogo_id is not null and not exists (
    select 1
    from public.planejamento_disciplinas pd
    join public.aulas_catalogo ac
      on ac.curso_disciplina_id = pd.curso_disciplina_id
    where pd.id = new.planejamento_disciplina_id
      and ac.id = new.aula_catalogo_id
  ) then
    raise exception 'aula de catálogo não pertence à disciplina do planejamento';
  end if;

  return new;
end;
$$;

create or replace function private.validar_meta_relacionamentos()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_planejamento public.planejamentos;
  v_pd public.planejamento_disciplinas;
  v_pc public.planejamento_cadernos;
  v_origem public.metas;
  v_newly_active boolean;
begin
  if new.deleted_at is not null then
    return new;
  end if;

  v_newly_active := tg_op = 'INSERT'
    or (tg_op = 'UPDATE' and old.deleted_at is not null and new.deleted_at is null);

  select * into v_planejamento
  from public.planejamentos
  where id = new.planejamento_id and deleted_at is null;

  if v_planejamento.id is null then
    raise exception 'planejamento da meta não existe ou está excluído';
  end if;

  if v_newly_active and v_planejamento.status <> 'ativo' then
    raise exception 'novas metas exigem planejamento ativo';
  end if;

  if new.planejamento_disciplina_id is not null then
    select * into v_pd
    from public.planejamento_disciplinas
    where id = new.planejamento_disciplina_id
      and planejamento_id = new.planejamento_id;

    if v_pd.id is null then
      raise exception 'disciplina não pertence ao planejamento da meta';
    end if;

    if v_newly_active and (not v_pd.ativo or v_pd.deleted_at is not null) then
      raise exception 'disciplina inativa não pode receber nova meta';
    end if;
  end if;

  if new.planejamento_caderno_id is not null then
    select * into v_pc
    from public.planejamento_cadernos
    where id = new.planejamento_caderno_id
      and planejamento_disciplina_id = new.planejamento_disciplina_id;

    if v_pc.id is null then
      raise exception 'caderno não pertence à disciplina da meta';
    end if;

    if v_newly_active and (not v_pc.ativo or v_pc.deleted_at is not null) then
      raise exception 'caderno inativo não pode receber nova meta';
    end if;
  end if;

  if v_newly_active
     and new.tipo = 'teoria'
     and v_planejamento.modelo_estudo = 'somente_blocos' then
    raise exception 'planejamento somente_blocos não aceita meta de teoria';
  end if;

  if new.origem_meta_id is not null then
    select * into v_origem
    from public.metas
    where id = new.origem_meta_id;

    if v_origem.id is null
       or v_origem.planejamento_id <> new.planejamento_id
       or v_origem.tipo <> 'bloco'
       or v_origem.status <> 'concluida'
       or v_origem.questoes_feitas < 1
       or v_origem.planejamento_disciplina_id <> new.planejamento_disciplina_id
       or v_origem.planejamento_caderno_id is distinct from new.planejamento_caderno_id then
      raise exception 'origem do reforço é inválida ou incompatível';
    end if;

    if v_newly_active and v_origem.deleted_at is not null then
      raise exception 'meta de origem excluída não pode gerar ou restaurar reforço';
    end if;
  end if;

  if v_newly_active and not exists (
    select 1 from public.profiles
    where id = new.created_by and ativo and deleted_at is null
  ) then
    raise exception 'created_by deve ser perfil ativo e vigente';
  end if;

  return new;
end;
$$;

create or replace function private.validar_transicao_meta()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.deleted_at is distinct from new.deleted_at or old.status = new.status then
    return new;
  end if;

  if not (
    (old.status = 'pendente' and new.status in ('em_andamento', 'concluida', 'pulada', 'cancelada'))
    or (old.status = 'em_andamento' and new.status in ('pendente', 'concluida', 'pulada', 'cancelada'))
    or (old.status = 'concluida' and new.status = 'pendente')
    or (old.status in ('pulada', 'cancelada') and new.status = 'pendente')
  ) then
    raise exception 'transição de meta inválida: % -> %', old.status, new.status;
  end if;

  return new;
end;
$$;

create or replace function private.validar_progresso_aula()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_aluno_id uuid;
begin
  if new.deleted_at is not null then
    return new;
  end if;

  select p.aluno_id into v_aluno_id
  from public.planejamento_aulas pa
  join public.planejamento_disciplinas pd on pd.id = pa.planejamento_disciplina_id
  join public.planejamentos p on p.id = pd.planejamento_id
  where pa.id = new.planejamento_aula_id
    and pa.deleted_at is null
    and pd.deleted_at is null
    and p.deleted_at is null;

  if v_aluno_id is distinct from new.aluno_id then
    raise exception 'progresso não pertence ao aluno do planejamento';
  end if;

  return new;
end;
$$;

create or replace function private.validar_configuracao_revisao()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.deleted_at is not null then
    return new;
  end if;

  if not exists (
    select 1
    from public.planejamento_disciplinas pd
    join public.planejamentos p on p.id = pd.planejamento_id
    where pd.id = new.planejamento_disciplina_id
      and pd.deleted_at is null
      and p.deleted_at is null
  ) then
    raise exception 'configuração de revisão não pertence a planejamento vigente';
  end if;

  return new;
end;
$$;

create or replace function private.validar_revisao()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_plano_origem uuid;
  v_plano_revisada uuid;
  v_aluno_id uuid;
begin
  if new.deleted_at is not null then
    return new;
  end if;

  select pd.planejamento_id into v_plano_origem
  from public.planejamento_aulas pa
  join public.planejamento_disciplinas pd on pd.id = pa.planejamento_disciplina_id
  where pa.id = new.planejamento_aula_origem_id
    and pa.deleted_at is null
    and pd.deleted_at is null;

  select pd.planejamento_id into v_plano_revisada
  from public.planejamento_aulas pa
  join public.planejamento_disciplinas pd on pd.id = pa.planejamento_disciplina_id
  where pa.id = new.planejamento_aula_revisada_id
    and pa.deleted_at is null
    and pd.deleted_at is null;

  if v_plano_origem is null or v_plano_origem is distinct from v_plano_revisada then
    raise exception 'aulas da revisão devem pertencer ao mesmo planejamento vigente';
  end if;

  select aluno_id into v_aluno_id
  from public.planejamentos
  where id = v_plano_origem and deleted_at is null;

  if v_aluno_id is distinct from new.aluno_id then
    raise exception 'revisão não pertence ao aluno do planejamento';
  end if;

  return new;
end;
$$;

create or replace function private.validar_transicao_revisao()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.deleted_at is distinct from new.deleted_at or old.status = new.status then
    return new;
  end if;

  if not (
    (old.status = 'pendente' and new.status in ('concluida', 'cancelada'))
    or (old.status in ('concluida', 'cancelada') and new.status = 'pendente')
  ) then
    raise exception 'transição de revisão inválida: % -> %', old.status, new.status;
  end if;

  return new;
end;
$$;

create or replace function private.validar_lista_espera()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.deleted_at is not null then
    return new;
  end if;

  if not exists (
    select 1 from public.profiles
    where id = new.aluno_id
      and tipo = 'aluno'
      and ativo
      and deleted_at is null
  ) then
    raise exception 'lista de espera deve pertencer a aluno ativo e vigente';
  end if;

  if new.professor_id is not null and not exists (
    select 1 from public.profiles
    where id = new.professor_id
      and tipo = 'professor'
      and ativo
      and deleted_at is null
  ) then
    raise exception 'professor da lista de espera é inválido';
  end if;

  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- Gatilhos
-- -----------------------------------------------------------------------------

do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'profiles', 'professor_alunos', 'acessos_aluno', 'cursos', 'disciplinas',
    'curso_disciplinas', 'cadernos_catalogo', 'aulas_catalogo', 'materiais_aula',
    'planejamentos', 'planejamento_disciplinas', 'planejamento_cadernos',
    'planejamento_aulas', 'metas', 'progresso_aulas', 'configuracoes_revisao',
    'revisoes', 'lista_espera'
  ] loop
    execute format(
      'create trigger trg_00_prevent_hard_delete before delete on public.%I for each row execute function private.prevent_hard_delete()',
      v_table
    );
    execute format(
      'create trigger trg_00_guard_soft_delete before update on public.%I for each row execute function private.guard_soft_delete_update()',
      v_table
    );
    execute format(
      'create trigger trg_90_set_updated_at before update on public.%I for each row execute function private.set_updated_at()',
      v_table
    );
    execute format(
      'create trigger trg_99_audit after insert or update on public.%I for each row execute function private.audit_row_change()',
      v_table
    );
  end loop;
end;
$$;

create trigger trg_10_validar_vinculo
before insert or update on public.professor_alunos
for each row execute function private.validar_vinculo_professor_aluno();

create trigger trg_05_validar_transicao_vinculo
before update on public.professor_alunos
for each row execute function private.validar_transicao_vinculo();

create trigger trg_10_validar_acesso
before insert or update on public.acessos_aluno
for each row execute function private.validar_acesso_aluno();

create trigger trg_05_validar_transicao_acesso
before update on public.acessos_aluno
for each row execute function private.validar_transicao_acesso();

create trigger trg_10_validar_curso_disciplina
before insert or update on public.curso_disciplinas
for each row execute function private.validar_curso_disciplina();

create trigger trg_10_validar_caderno_catalogo
before insert or update on public.cadernos_catalogo
for each row execute function private.validar_item_catalogo();

create trigger trg_10_validar_aula_catalogo
before insert or update on public.aulas_catalogo
for each row execute function private.validar_item_catalogo();

create trigger trg_10_validar_material_aula
before insert or update on public.materiais_aula
for each row execute function private.validar_item_catalogo();

create trigger trg_10_validar_planejamento
before insert or update on public.planejamentos
for each row execute function private.validar_planejamento();

create trigger trg_10_validar_planejamento_disciplina
before insert or update on public.planejamento_disciplinas
for each row execute function private.validar_planejamento_disciplina();

create trigger trg_10_validar_planejamento_caderno
before insert or update on public.planejamento_cadernos
for each row execute function private.validar_planejamento_caderno();

create trigger trg_10_validar_planejamento_aula
before insert or update on public.planejamento_aulas
for each row execute function private.validar_planejamento_aula();

create trigger trg_10_validar_transicao_meta
before update on public.metas
for each row execute function private.validar_transicao_meta();

create trigger trg_20_validar_meta_relacionamentos
before insert or update on public.metas
for each row execute function private.validar_meta_relacionamentos();

create trigger trg_10_validar_progresso
before insert or update on public.progresso_aulas
for each row execute function private.validar_progresso_aula();

create trigger trg_10_validar_configuracao_revisao
before insert or update on public.configuracoes_revisao
for each row execute function private.validar_configuracao_revisao();

create trigger trg_10_validar_transicao_revisao
before update on public.revisoes
for each row execute function private.validar_transicao_revisao();

create trigger trg_20_validar_revisao
before insert or update on public.revisoes
for each row execute function private.validar_revisao();

create trigger trg_10_validar_lista_espera
before insert or update on public.lista_espera
for each row execute function private.validar_lista_espera();

create trigger trg_00_prevent_hard_delete
before delete on public.meta_resultados
for each row execute function private.prevent_hard_delete();

create trigger trg_00_guard_meta_resultado
before update on public.meta_resultados
for each row execute function private.guard_meta_resultado_update();

create trigger trg_90_set_updated_at
before update on public.meta_resultados
for each row execute function private.set_updated_at();

create trigger trg_99_audit
after insert or update on public.meta_resultados
for each row execute function private.audit_append_only_change();

create trigger trg_00_prevent_audit_update
before update on public.audit_events
for each row execute function private.prevent_audit_mutation();

create trigger trg_00_prevent_audit_delete
before delete on public.audit_events
for each row execute function private.prevent_audit_mutation();

-- -----------------------------------------------------------------------------
-- Perfil automático do Supabase Auth
-- -----------------------------------------------------------------------------

create or replace function private.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_nome text;
begin
  v_nome := coalesce(
    nullif(btrim(new.raw_user_meta_data ->> 'nome'), ''),
    nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''),
    nullif(btrim(split_part(coalesce(new.email, ''), '@', 1)), '')
  );

  if length(coalesce(v_nome, '')) < 2 then
    v_nome := 'Usuário ' || left(new.id::text, 8);
  end if;

  insert into public.profiles (id, nome, tipo)
  values (new.id, v_nome, 'aluno')
  on conflict (id) do nothing;

  insert into public.acessos_aluno (aluno_id, status, plano)
  values (new.id, 'pendente', 'manual')
  on conflict do nothing;

  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function private.handle_new_auth_user();

-- -----------------------------------------------------------------------------
-- Funções auxiliares de autorização
-- -----------------------------------------------------------------------------

create or replace function public.eh_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and tipo = 'admin'
      and ativo
      and deleted_at is null
  );
$$;

create or replace function public.professor_tem_aluno(p_aluno_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.professor_alunos pa
    join public.profiles professor on professor.id = pa.professor_id
    join public.profiles aluno on aluno.id = pa.aluno_id
    where pa.professor_id = auth.uid()
      and pa.aluno_id = p_aluno_id
      and pa.status = 'ativo'
      and pa.deleted_at is null
      and professor.tipo = 'professor'
      and professor.ativo
      and professor.deleted_at is null
      and aluno.tipo = 'aluno'
      and aluno.ativo
      and aluno.deleted_at is null
  );
$$;

create or replace function public.pode_acessar_planejamento(p_planejamento_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.planejamentos p
    where p.id = p_planejamento_id
      and p.deleted_at is null
      and (
        p.aluno_id = auth.uid()
        or public.professor_tem_aluno(p.aluno_id)
        or public.eh_admin()
      )
  );
$$;

create or replace function public.aluno_possui_acesso(p_aluno_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (
      p_aluno_id = auth.uid()
      or public.professor_tem_aluno(p_aluno_id)
      or public.eh_admin()
    )
    and exists (
      select 1
      from public.acessos_aluno a
      where a.aluno_id = p_aluno_id
        and a.status = 'ativo'
        and a.deleted_at is null
        and coalesce(a.inicio_em, current_date) <= current_date
        and (a.expira_em is null or a.expira_em >= current_date)
    ),
    false
  );
$$;

create or replace function private.require_authenticated()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'usuário não autenticado' using errcode = '42501';
  end if;

  return v_user_id;
end;
$$;

create or replace function public.status_acesso_efetivo(p_acesso public.acessos_aluno)
returns public.status_acesso
language sql
stable
set search_path = ''
as $$
  select case
    when p_acesso.status = 'ativo'
      and p_acesso.expira_em is not null
      and p_acesso.expira_em < current_date
      then 'expirado'::public.status_acesso
    else p_acesso.status
  end;
$$;

create view public.acessos_aluno_efetivos
with (security_invoker = true)
as
select
  a.*,
  public.status_acesso_efetivo(a) as status_efetivo
from public.acessos_aluno a
where a.deleted_at is null;

-- -----------------------------------------------------------------------------
-- Soft delete e restauração autorizados
-- -----------------------------------------------------------------------------

create or replace function private.can_mutate_record(p_resource text, p_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    return false;
  end if;

  if public.eh_admin() then
    return true;
  end if;

  case p_resource
    when 'profiles' then
      return p_id = auth.uid();

    when 'professor_alunos' then
      return false;

    when 'acessos_aluno' then
      return false;

    when 'cursos' then
      return false;
    when 'disciplinas' then
      return false;
    when 'curso_disciplinas' then
      return false;
    when 'cadernos_catalogo' then
      return false;
    when 'aulas_catalogo' then
      return false;
    when 'materiais_aula' then
      return false;

    when 'planejamentos' then
      return exists (
        select 1 from public.planejamentos p
        where p.id = p_id
          and public.professor_tem_aluno(p.aluno_id)
          and not exists (
            select 1 from public.metas m
            where m.planejamento_id = p.id
              and m.status = 'concluida'
              and m.deleted_at is null
          )
      );

    when 'planejamento_disciplinas' then
      return exists (
        select 1
        from public.planejamento_disciplinas pd
        join public.planejamentos p on p.id = pd.planejamento_id
        where pd.id = p_id and public.professor_tem_aluno(p.aluno_id)
      );

    when 'planejamento_cadernos' then
      return exists (
        select 1
        from public.planejamento_cadernos pc
        join public.planejamento_disciplinas pd on pd.id = pc.planejamento_disciplina_id
        join public.planejamentos p on p.id = pd.planejamento_id
        where pc.id = p_id and public.professor_tem_aluno(p.aluno_id)
      );

    when 'planejamento_aulas' then
      return exists (
        select 1
        from public.planejamento_aulas pa
        join public.planejamento_disciplinas pd on pd.id = pa.planejamento_disciplina_id
        join public.planejamentos p on p.id = pd.planejamento_id
        where pa.id = p_id and public.professor_tem_aluno(p.aluno_id)
      );

    when 'metas' then
      return exists (
        select 1
        from public.metas m
        join public.planejamentos p on p.id = m.planejamento_id
        where m.id = p_id
          and (
            (
              public.professor_tem_aluno(p.aluno_id)
              and m.status <> 'concluida'
            )
            or (
              p.aluno_id = auth.uid()
              and m.tipo = 'extra'
              and m.created_by = auth.uid()
            )
          )
      );

    when 'progresso_aulas' then
      return exists (
        select 1 from public.progresso_aulas pa
        where pa.id = p_id and pa.aluno_id = auth.uid()
      );

    when 'configuracoes_revisao' then
      return exists (
        select 1
        from public.configuracoes_revisao cr
        join public.planejamento_disciplinas pd on pd.id = cr.planejamento_disciplina_id
        join public.planejamentos p on p.id = pd.planejamento_id
        where cr.id = p_id and public.professor_tem_aluno(p.aluno_id)
      );

    when 'revisoes' then
      return exists (
        select 1
        from public.revisoes r
        where r.id = p_id
          and (
            (r.aluno_id = auth.uid() and r.status <> 'concluida')
            or public.professor_tem_aluno(r.aluno_id)
          )
      );

    when 'lista_espera' then
      return exists (
        select 1
        from public.lista_espera le
        where le.id = p_id
          and (
            le.aluno_id = auth.uid()
            or public.professor_tem_aluno(le.aluno_id)
          )
      );

    else
      return false;
  end case;
end;
$$;

create or replace function private.change_soft_delete_state(
  p_table regclass,
  p_resource text,
  p_id uuid,
  p_reason text,
  p_restore boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
  v_operation_id uuid := gen_random_uuid();
begin
  if not private.can_mutate_record(p_resource, p_id) then
    raise exception 'sem permissão para alterar exclusão de %', p_resource;
  end if;

  if length(btrim(coalesce(p_reason, ''))) = 0 then
    raise exception 'motivo é obrigatório';
  end if;

  perform set_config('app.audit_reason', btrim(p_reason), true);
  perform set_config('app.audit_operation_id', v_operation_id::text, true);

  if p_restore then
    execute format(
      'update %s as t
          set deleted_at = null,
              deleted_by = null,
              delete_reason = null,
              delete_operation_id = null
        where t.id = $1 and t.deleted_at is not null
        returning to_jsonb(t)',
      p_table
    ) using p_id into v_result;
  else
    execute format(
      'update %s as t
          set deleted_at = now(),
              deleted_by = $2,
              delete_reason = $3,
              delete_operation_id = $4
        where t.id = $1 and t.deleted_at is null
        returning to_jsonb(t)',
      p_table
    ) using p_id, auth.uid(), btrim(p_reason), v_operation_id into v_result;
  end if;

  if v_result is null then
    raise exception 'registro não encontrado ou já está no estado solicitado';
  end if;

  return v_result;
end;
$$;

do $factory$
declare
  v_item record;
begin
  for v_item in
    select * from (values
      ('profiles', 'profile'),
      ('professor_alunos', 'vinculo'),
      ('acessos_aluno', 'acesso'),
      ('cursos', 'curso'),
      ('disciplinas', 'disciplina'),
      ('curso_disciplinas', 'curso_disciplina'),
      ('cadernos_catalogo', 'caderno_catalogo'),
      ('aulas_catalogo', 'aula_catalogo'),
      ('materiais_aula', 'material_aula'),
      ('planejamentos', 'planejamento'),
      ('planejamento_disciplinas', 'planejamento_disciplina'),
      ('planejamento_cadernos', 'planejamento_caderno'),
      ('planejamento_aulas', 'planejamento_aula'),
      ('metas', 'meta'),
      ('progresso_aulas', 'progresso_aula'),
      ('configuracoes_revisao', 'configuracao_revisao'),
      ('revisoes', 'revisao'),
      ('lista_espera', 'lista_espera')
    ) as resources(table_name, function_suffix)
  loop
    execute format($function$
      create or replace function public.%I(p_id uuid, p_reason text)
      returns jsonb
      language sql
      security definer
      set search_path = ''
      as $body$
        select private.change_soft_delete_state(
          %L::regclass,
          %L,
          p_id,
          p_reason,
          false
        );
      $body$;
    $function$,
      'soft_delete_' || v_item.function_suffix,
      'public.' || v_item.table_name,
      v_item.table_name
    );

    execute format($function$
      create or replace function public.%I(p_id uuid, p_reason text)
      returns jsonb
      language sql
      security definer
      set search_path = ''
      as $body$
        select private.change_soft_delete_state(
          %L::regclass,
          %L,
          p_id,
          p_reason,
          true
        );
      $body$;
    $function$,
      'restore_' || v_item.function_suffix,
      'public.' || v_item.table_name,
      v_item.table_name
    );
  end loop;
end;
$factory$;

-- -----------------------------------------------------------------------------
-- RPCs de perfil, vínculo e acesso
-- -----------------------------------------------------------------------------

create or replace function public.atualizar_meu_perfil(
  p_nome text,
  p_telefone text default null,
  p_fuso_horario text default 'America/Sao_Paulo'
)
returns public.profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_perfil public.profiles;
begin
  if auth.uid() is null then
    raise exception 'usuário não autenticado';
  end if;
  if length(btrim(coalesce(p_nome, ''))) < 2 then
    raise exception 'nome inválido';
  end if;
  if not exists (
    select 1 from pg_catalog.pg_timezone_names
    where name = coalesce(nullif(btrim(p_fuso_horario), ''), 'America/Sao_Paulo')
  ) then
    raise exception 'fuso horário inválido';
  end if;

  perform set_config('app.audit_reason', 'atualização do próprio perfil', true);
  update public.profiles
     set nome = btrim(p_nome),
         telefone = nullif(btrim(p_telefone), ''),
         fuso_horario = coalesce(nullif(btrim(p_fuso_horario), ''), 'America/Sao_Paulo')
   where id = auth.uid() and deleted_at is null
   returning * into v_perfil;

  if v_perfil.id is null then
    raise exception 'perfil não encontrado ou excluído';
  end if;
  return v_perfil;
end;
$$;

create or replace function public.vincular_professor_aluno(
  p_professor_id uuid,
  p_aluno_id uuid,
  p_inicio_em date default current_date
)
returns public.professor_alunos
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_vinculo public.professor_alunos;
begin
  if not public.eh_admin() then
    raise exception 'somente administrador pode criar vínculo';
  end if;

  perform set_config('app.audit_reason', 'criação de vínculo professor-aluno', true);
  insert into public.professor_alunos (professor_id, aluno_id, inicio_em)
  values (p_professor_id, p_aluno_id, coalesce(p_inicio_em, current_date))
  returning * into v_vinculo;
  return v_vinculo;
end;
$$;

create or replace function public.encerrar_vinculo(
  p_vinculo_id uuid,
  p_fim_em date default current_date
)
returns public.professor_alunos
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_vinculo public.professor_alunos;
begin
  if not public.eh_admin() then
    raise exception 'somente administrador pode encerrar vínculo';
  end if;

  perform set_config('app.audit_reason', 'encerramento de vínculo professor-aluno', true);
  update public.professor_alunos
     set status = 'encerrado',
         fim_em = coalesce(p_fim_em, current_date)
   where id = p_vinculo_id
     and status = 'ativo'
     and deleted_at is null
   returning * into v_vinculo;

  if v_vinculo.id is null then
    raise exception 'vínculo ativo não encontrado';
  end if;
  return v_vinculo;
end;
$$;

create or replace function public.liberar_acesso(
  p_aluno_id uuid,
  p_meses integer default 3,
  p_sem_expiracao boolean default false,
  p_plano text default 'manual'
)
returns public.acessos_aluno
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_acesso public.acessos_aluno;
begin
  if not (public.eh_admin() or public.professor_tem_aluno(p_aluno_id)) then
    raise exception 'sem permissão para liberar este aluno';
  end if;
  if not p_sem_expiracao and coalesce(p_meses, 0) < 1 then
    raise exception 'meses deve ser maior que zero';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_aluno_id::text, 1));
  perform set_config('app.audit_reason', 'nova liberação de acesso', true);

  update public.acessos_aluno
     set status = 'expirado',
         bloqueado_em = null,
         motivo_bloqueio = null
   where aluno_id = p_aluno_id
     and status in ('pendente', 'ativo', 'bloqueado')
     and deleted_at is null;

  insert into public.acessos_aluno (
    aluno_id, status, plano, inicio_em, expira_em, liberado_por
  ) values (
    p_aluno_id,
    'ativo',
    coalesce(nullif(btrim(p_plano), ''), 'manual'),
    current_date,
    case
      when p_sem_expiracao then null
      else (current_date + make_interval(months => p_meses))::date
    end,
    auth.uid()
  ) returning * into v_acesso;
  return v_acesso;
end;
$$;

create or replace function public.bloquear_acesso(
  p_aluno_id uuid,
  p_motivo text
)
returns public.acessos_aluno
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_acesso public.acessos_aluno;
begin
  if not (public.eh_admin() or public.professor_tem_aluno(p_aluno_id)) then
    raise exception 'sem permissão para bloquear este aluno';
  end if;
  if length(btrim(coalesce(p_motivo, ''))) = 0 then
    raise exception 'motivo do bloqueio é obrigatório';
  end if;

  perform set_config('app.audit_reason', 'bloqueio de acesso: ' || btrim(p_motivo), true);
  update public.acessos_aluno
     set status = 'bloqueado',
         bloqueado_em = now(),
         motivo_bloqueio = btrim(p_motivo)
   where aluno_id = p_aluno_id
     and status in ('pendente', 'ativo')
     and deleted_at is null
   returning * into v_acesso;

  if v_acesso.id is null then
    raise exception 'acesso corrente não encontrado';
  end if;
  return v_acesso;
end;
$$;

create or replace function public.renovar_acesso(
  p_aluno_id uuid,
  p_meses integer default 3
)
returns public.acessos_aluno
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_acesso public.acessos_aluno;
begin
  if not (public.eh_admin() or public.professor_tem_aluno(p_aluno_id)) then
    raise exception 'sem permissão para renovar este aluno';
  end if;
  if coalesce(p_meses, 0) < 1 then
    raise exception 'meses deve ser maior que zero';
  end if;

  perform set_config('app.audit_reason', 'renovação de acesso', true);
  update public.acessos_aluno
     set status = 'ativo',
         inicio_em = coalesce(inicio_em, current_date),
         expira_em = case
           when status = 'ativo' and expira_em is null then null
           else (
             greatest(coalesce(expira_em, current_date), current_date)
             + make_interval(months => p_meses)
           )::date
         end,
         bloqueado_em = null,
         motivo_bloqueio = null,
         liberado_por = auth.uid()
   where aluno_id = p_aluno_id
     and status in ('pendente', 'ativo', 'bloqueado')
     and deleted_at is null
   returning * into v_acesso;

  if v_acesso.id is null then
    raise exception 'acesso corrente não encontrado; use liberar_acesso';
  end if;
  return v_acesso;
end;
$$;

create or replace function public.cancelar_acesso(p_aluno_id uuid)
returns public.acessos_aluno
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_acesso public.acessos_aluno;
begin
  if not (public.eh_admin() or public.professor_tem_aluno(p_aluno_id)) then
    raise exception 'sem permissão para cancelar este aluno';
  end if;

  perform set_config('app.audit_reason', 'cancelamento de acesso', true);
  update public.acessos_aluno
     set status = 'cancelado',
         bloqueado_em = null,
         motivo_bloqueio = null
   where aluno_id = p_aluno_id
     and status in ('pendente', 'ativo', 'bloqueado')
     and deleted_at is null
   returning * into v_acesso;

  if v_acesso.id is null then
    raise exception 'acesso corrente não encontrado';
  end if;
  return v_acesso;
end;
$$;

-- -----------------------------------------------------------------------------
-- RPCs administrativas de catálogo
-- -----------------------------------------------------------------------------

create or replace function public.salvar_curso(
  p_codigo text,
  p_nome text,
  p_area text default null,
  p_concurso_alvo text default null,
  p_fase public.fase_curso default 'pre_edital',
  p_modelo_estudo public.modelo_estudo default 'teoria_blocos',
  p_metas_semanais_padrao integer default 24,
  p_ativo boolean default true,
  p_id uuid default null
)
returns public.cursos
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_curso public.cursos;
begin
  if not public.eh_admin() then
    raise exception 'somente administrador pode gerenciar catálogo';
  end if;
  perform set_config('app.audit_reason', 'manutenção de curso', true);

  if p_id is null then
    insert into public.cursos (
      codigo, nome, area, concurso_alvo, fase, modelo_estudo,
      metas_semanais_padrao, ativo
    ) values (
      btrim(p_codigo), btrim(p_nome), nullif(btrim(p_area), ''),
      nullif(btrim(p_concurso_alvo), ''), p_fase, p_modelo_estudo,
      p_metas_semanais_padrao, p_ativo
    ) returning * into v_curso;
  else
    update public.cursos
       set codigo = btrim(p_codigo),
           nome = btrim(p_nome),
           area = nullif(btrim(p_area), ''),
           concurso_alvo = nullif(btrim(p_concurso_alvo), ''),
           fase = p_fase,
           modelo_estudo = p_modelo_estudo,
           metas_semanais_padrao = p_metas_semanais_padrao,
           ativo = p_ativo
     where id = p_id and deleted_at is null
     returning * into v_curso;
  end if;

  if v_curso.id is null then
    raise exception 'curso não encontrado ou excluído';
  end if;
  return v_curso;
end;
$$;

create or replace function public.salvar_disciplina(
  p_codigo text,
  p_nome text,
  p_cor varchar default null,
  p_ativo boolean default true,
  p_id uuid default null
)
returns public.disciplinas
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_disciplina public.disciplinas;
begin
  if not public.eh_admin() then
    raise exception 'somente administrador pode gerenciar catálogo';
  end if;
  perform set_config('app.audit_reason', 'manutenção de disciplina', true);

  if p_id is null then
    insert into public.disciplinas (codigo, nome, cor, ativo)
    values (btrim(p_codigo), btrim(p_nome), p_cor, p_ativo)
    returning * into v_disciplina;
  else
    update public.disciplinas
       set codigo = btrim(p_codigo),
           nome = btrim(p_nome),
           cor = p_cor,
           ativo = p_ativo
     where id = p_id and deleted_at is null
     returning * into v_disciplina;
  end if;

  if v_disciplina.id is null then
    raise exception 'disciplina não encontrada ou excluída';
  end if;
  return v_disciplina;
end;
$$;

create or replace function public.salvar_curso_disciplina(
  p_curso_id uuid,
  p_disciplina_id uuid,
  p_modalidade public.modalidade_disciplina default 'blocos',
  p_meta_padrao numeric default 80,
  p_peso_padrao numeric default 1,
  p_ordem integer default 0,
  p_ativo boolean default true,
  p_id uuid default null
)
returns public.curso_disciplinas
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item public.curso_disciplinas;
begin
  if not public.eh_admin() then
    raise exception 'somente administrador pode gerenciar catálogo';
  end if;
  perform set_config('app.audit_reason', 'manutenção de disciplina do curso', true);

  if p_id is null then
    insert into public.curso_disciplinas (
      curso_id, disciplina_id, modalidade, meta_padrao,
      peso_padrao, ordem, ativo
    ) values (
      p_curso_id, p_disciplina_id, p_modalidade, p_meta_padrao,
      p_peso_padrao, p_ordem, p_ativo
    ) returning * into v_item;
  else
    update public.curso_disciplinas
       set curso_id = p_curso_id,
           disciplina_id = p_disciplina_id,
           modalidade = p_modalidade,
           meta_padrao = p_meta_padrao,
           peso_padrao = p_peso_padrao,
           ordem = p_ordem,
           ativo = p_ativo
     where id = p_id and deleted_at is null
     returning * into v_item;
  end if;

  if v_item.id is null then
    raise exception 'disciplina do curso não encontrada ou excluída';
  end if;
  return v_item;
end;
$$;

create or replace function public.salvar_caderno_catalogo(
  p_curso_disciplina_id uuid,
  p_nome text,
  p_link_tec text default null,
  p_total_questoes integer default 0,
  p_ordem integer default 0,
  p_ativo boolean default true,
  p_id uuid default null
)
returns public.cadernos_catalogo
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item public.cadernos_catalogo;
begin
  if not public.eh_admin() then
    raise exception 'somente administrador pode gerenciar catálogo';
  end if;
  perform set_config('app.audit_reason', 'manutenção de caderno de catálogo', true);

  if p_id is null then
    insert into public.cadernos_catalogo (
      curso_disciplina_id, nome, link_tec, total_questoes, ordem, ativo
    ) values (
      p_curso_disciplina_id, btrim(p_nome), nullif(btrim(p_link_tec), ''),
      p_total_questoes, p_ordem, p_ativo
    ) returning * into v_item;
  else
    update public.cadernos_catalogo
       set curso_disciplina_id = p_curso_disciplina_id,
           nome = btrim(p_nome),
           link_tec = nullif(btrim(p_link_tec), ''),
           total_questoes = p_total_questoes,
           ordem = p_ordem,
           ativo = p_ativo
     where id = p_id and deleted_at is null
     returning * into v_item;
  end if;

  if v_item.id is null then
    raise exception 'caderno não encontrado ou excluído';
  end if;
  return v_item;
end;
$$;

create or replace function public.salvar_aula_catalogo(
  p_curso_disciplina_id uuid,
  p_nome text,
  p_ordem integer default 0,
  p_link_tec text default null,
  p_total_questoes integer default 0,
  p_ativo boolean default true,
  p_id uuid default null
)
returns public.aulas_catalogo
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item public.aulas_catalogo;
begin
  if not public.eh_admin() then
    raise exception 'somente administrador pode gerenciar catálogo';
  end if;
  perform set_config('app.audit_reason', 'manutenção de aula de catálogo', true);

  if p_id is null then
    insert into public.aulas_catalogo (
      curso_disciplina_id, nome, ordem, link_tec, total_questoes, ativo
    ) values (
      p_curso_disciplina_id, btrim(p_nome), p_ordem,
      nullif(btrim(p_link_tec), ''), p_total_questoes, p_ativo
    ) returning * into v_item;
  else
    update public.aulas_catalogo
       set curso_disciplina_id = p_curso_disciplina_id,
           nome = btrim(p_nome),
           ordem = p_ordem,
           link_tec = nullif(btrim(p_link_tec), ''),
           total_questoes = p_total_questoes,
           ativo = p_ativo
     where id = p_id and deleted_at is null
     returning * into v_item;
  end if;

  if v_item.id is null then
    raise exception 'aula não encontrada ou excluída';
  end if;
  return v_item;
end;
$$;

create or replace function public.salvar_material_aula(
  p_aula_id uuid,
  p_tipo public.tipo_material,
  p_nome text,
  p_url text default null,
  p_ordem integer default 0,
  p_id uuid default null
)
returns public.materiais_aula
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item public.materiais_aula;
begin
  if not public.eh_admin() then
    raise exception 'somente administrador pode gerenciar catálogo';
  end if;
  perform set_config('app.audit_reason', 'manutenção de material de aula', true);

  if p_id is null then
    insert into public.materiais_aula (aula_id, tipo, nome, url, ordem)
    values (p_aula_id, p_tipo, btrim(p_nome), nullif(btrim(p_url), ''), p_ordem)
    returning * into v_item;
  else
    update public.materiais_aula
       set aula_id = p_aula_id,
           tipo = p_tipo,
           nome = btrim(p_nome),
           url = nullif(btrim(p_url), ''),
           ordem = p_ordem
     where id = p_id and deleted_at is null
     returning * into v_item;
  end if;

  if v_item.id is null then
    raise exception 'material não encontrado ou excluído';
  end if;
  return v_item;
end;
$$;

-- -----------------------------------------------------------------------------
-- RPCs de planejamento e snapshots
-- -----------------------------------------------------------------------------

create or replace function public.criar_planejamento(
  p_aluno_id uuid,
  p_curso_id uuid,
  p_nome text,
  p_metas_semanais integer default null,
  p_data_inicio date default current_date,
  p_professor_id uuid default null
)
returns public.planejamentos
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_curso public.cursos;
  v_planejamento public.planejamentos;
  v_professor_id uuid;
  v_cd record;
  v_pd_id uuid;
begin
  if auth.uid() is null then
    raise exception 'usuário não autenticado';
  end if;

  v_professor_id := case
    when public.eh_admin() then coalesce(p_professor_id, auth.uid())
    else auth.uid()
  end;

  if not exists (
    select 1 from public.professor_alunos
    where professor_id = v_professor_id
      and aluno_id = p_aluno_id
      and status = 'ativo'
      and deleted_at is null
  ) then
    raise exception 'professor e aluno não possuem vínculo ativo';
  end if;

  select * into v_curso
  from public.cursos
  where id = p_curso_id and ativo and deleted_at is null;

  if v_curso.id is null then
    raise exception 'curso ativo não encontrado';
  end if;

  perform set_config('app.audit_reason', 'criação de planejamento com snapshot do catálogo', true);
  perform set_config('app.audit_operation_id', gen_random_uuid()::text, true);

  insert into public.planejamentos (
    professor_id, aluno_id, curso_id, curso_codigo_snapshot,
    curso_nome_snapshot, nome, fase, modelo_estudo, metas_semanais,
    data_inicio, status
  ) values (
    v_professor_id, p_aluno_id, v_curso.id, v_curso.codigo,
    v_curso.nome, btrim(p_nome), v_curso.fase, v_curso.modelo_estudo,
    coalesce(p_metas_semanais, v_curso.metas_semanais_padrao),
    coalesce(p_data_inicio, current_date), 'ativo'
  ) returning * into v_planejamento;

  for v_cd in
    select cd.*, d.codigo as disciplina_codigo, d.nome as disciplina_nome,
           d.cor as disciplina_cor
    from public.curso_disciplinas cd
    join public.disciplinas d on d.id = cd.disciplina_id
    where cd.curso_id = v_curso.id
      and cd.ativo
      and cd.deleted_at is null
      and d.ativo
      and d.deleted_at is null
    order by cd.ordem, cd.id
  loop
    insert into public.planejamento_disciplinas (
      planejamento_id, curso_disciplina_id, disciplina_id,
      disciplina_codigo_snapshot, disciplina_nome_snapshot,
      disciplina_cor_snapshot, modalidade, meta_percentual,
      peso, ordem
    ) values (
      v_planejamento.id, v_cd.id, v_cd.disciplina_id,
      v_cd.disciplina_codigo, v_cd.disciplina_nome,
      v_cd.disciplina_cor, v_cd.modalidade, v_cd.meta_padrao,
      v_cd.peso_padrao, v_cd.ordem
    ) returning id into v_pd_id;

    insert into public.planejamento_cadernos (
      planejamento_disciplina_id, caderno_catalogo_id, nome,
      link_tec, total_questoes, ordem, ativo
    )
    select
      v_pd_id, c.id, c.nome, c.link_tec, c.total_questoes, c.ordem, c.ativo
    from public.cadernos_catalogo c
    where c.curso_disciplina_id = v_cd.id
      and c.deleted_at is null
    order by c.ordem, c.id;

    insert into public.planejamento_aulas (
      planejamento_disciplina_id, aula_catalogo_id, nome, ordem,
      link_tec, total_questoes, materiais_snapshot, ativo
    )
    select
      v_pd_id,
      a.id,
      a.nome,
      a.ordem,
      a.link_tec,
      a.total_questoes,
      coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'id', m.id,
            'tipo', m.tipo,
            'nome', m.nome,
            'url', m.url,
            'ordem', m.ordem
          ) order by m.ordem, m.id
        )
        from public.materiais_aula m
        where m.aula_id = a.id and m.deleted_at is null
      ), '[]'::jsonb),
      a.ativo
    from public.aulas_catalogo a
    where a.curso_disciplina_id = v_cd.id
      and a.deleted_at is null
    order by a.ordem, a.id;
  end loop;

  return v_planejamento;
end;
$$;

create or replace function public.atualizar_planejamento(
  p_planejamento_id uuid,
  p_nome text default null,
  p_metas_semanais integer default null,
  p_status public.status_planejamento default null,
  p_fase public.fase_curso default null,
  p_modelo_estudo public.modelo_estudo default null
)
returns public.planejamentos
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_planejamento public.planejamentos;
begin
  if not private.can_mutate_record('planejamentos', p_planejamento_id) then
    raise exception 'sem permissão para alterar planejamento';
  end if;

  if p_modelo_estudo = 'somente_blocos' and exists (
    select 1
    from public.planejamento_disciplinas
    where planejamento_id = p_planejamento_id
      and modalidade <> 'blocos'
      and deleted_at is null
  ) then
    raise exception 'existem disciplinas incompatíveis com somente_blocos';
  end if;

  perform set_config('app.audit_reason', 'atualização de planejamento', true);
  update public.planejamentos
     set nome = coalesce(nullif(btrim(p_nome), ''), nome),
         metas_semanais = coalesce(p_metas_semanais, metas_semanais),
         status = coalesce(p_status, status),
         fase = coalesce(p_fase, fase),
         modelo_estudo = coalesce(p_modelo_estudo, modelo_estudo)
   where id = p_planejamento_id and deleted_at is null
   returning * into v_planejamento;

  if v_planejamento.id is null then
    raise exception 'planejamento não encontrado ou excluído';
  end if;
  return v_planejamento;
end;
$$;

create or replace function public.atualizar_planejamento_disciplina(
  p_id uuid,
  p_modalidade public.modalidade_disciplina,
  p_meta_percentual numeric,
  p_peso numeric,
  p_minimo_metas integer,
  p_maximo_metas integer,
  p_ordem integer,
  p_ativo boolean
)
returns public.planejamento_disciplinas
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item public.planejamento_disciplinas;
begin
  if not private.can_mutate_record('planejamento_disciplinas', p_id) then
    raise exception 'sem permissão para alterar disciplina do planejamento';
  end if;

  perform set_config('app.audit_reason', 'configuração de disciplina do planejamento', true);
  update public.planejamento_disciplinas
     set modalidade = p_modalidade,
         meta_percentual = p_meta_percentual,
         peso = p_peso,
         minimo_metas = p_minimo_metas,
         maximo_metas = p_maximo_metas,
         ordem = p_ordem,
         ativo = p_ativo
   where id = p_id and deleted_at is null
   returning * into v_item;

  if v_item.id is null then
    raise exception 'disciplina do planejamento não encontrada ou excluída';
  end if;
  return v_item;
end;
$$;

create or replace function public.atualizar_planejamento_caderno(
  p_id uuid,
  p_nome text,
  p_link_tec text,
  p_total_questoes integer,
  p_ordem integer,
  p_ativo boolean
)
returns public.planejamento_cadernos
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item public.planejamento_cadernos;
begin
  if not private.can_mutate_record('planejamento_cadernos', p_id) then
    raise exception 'sem permissão para alterar caderno do planejamento';
  end if;

  perform set_config('app.audit_reason', 'configuração de caderno do planejamento', true);
  update public.planejamento_cadernos
     set nome = btrim(p_nome),
         link_tec = nullif(btrim(p_link_tec), ''),
         total_questoes = p_total_questoes,
         ordem = p_ordem,
         ativo = p_ativo
   where id = p_id and deleted_at is null
   returning * into v_item;

  if v_item.id is null then
    raise exception 'caderno do planejamento não encontrado ou excluído';
  end if;
  return v_item;
end;
$$;

create or replace function public.atualizar_planejamento_aula(
  p_id uuid,
  p_nome text,
  p_link_tec text,
  p_total_questoes integer,
  p_ordem integer,
  p_ativo boolean
)
returns public.planejamento_aulas
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item public.planejamento_aulas;
begin
  if not private.can_mutate_record('planejamento_aulas', p_id) then
    raise exception 'sem permissão para alterar aula do planejamento';
  end if;

  perform set_config('app.audit_reason', 'configuração de aula do planejamento', true);
  update public.planejamento_aulas
     set nome = btrim(p_nome),
         link_tec = nullif(btrim(p_link_tec), ''),
         total_questoes = p_total_questoes,
         ordem = p_ordem,
         ativo = p_ativo
   where id = p_id and deleted_at is null
   returning * into v_item;

  if v_item.id is null then
    raise exception 'aula do planejamento não encontrada ou excluída';
  end if;
  return v_item;
end;
$$;

-- -----------------------------------------------------------------------------
-- RPCs de metas e resultados históricos
-- -----------------------------------------------------------------------------

create or replace function public.atualizar_meta(
  p_meta_id uuid,
  p_titulo text,
  p_descricao text,
  p_semana integer,
  p_dia smallint,
  p_ordem integer,
  p_tempo_previsto_minutos integer
)
returns public.metas
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_meta public.metas;
  v_aluno_id uuid;
begin
  perform private.require_authenticated();

  select m.*
    into v_meta
  from public.metas m
  join public.planejamentos p on p.id = m.planejamento_id
  where m.id = p_meta_id
    and m.deleted_at is null
    and p.deleted_at is null
  for update of m;

  select aluno_id into v_aluno_id
  from public.planejamentos
  where id = v_meta.planejamento_id;

  if v_meta.id is null then
    raise exception 'meta não encontrada';
  end if;
  if not (public.eh_admin() or public.professor_tem_aluno(v_aluno_id)) then
    raise exception 'sem permissão para editar meta';
  end if;
  if v_meta.status = 'concluida' then
    raise exception 'meta concluída não pode ter seu planejamento sobrescrito';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_meta.planejamento_id::text, 2));
  perform set_config('app.audit_reason', 'edição de meta planejada', true);
  update public.metas
     set titulo = btrim(p_titulo),
         descricao = nullif(btrim(p_descricao), ''),
         semana_numero = p_semana,
         dia_semana = p_dia,
         ordem_dia = p_ordem,
         tempo_previsto_minutos = p_tempo_previsto_minutos
   where id = p_meta_id
   returning * into v_meta;
  return v_meta;
end;
$$;

create or replace function public.concluir_meta(
  p_meta_id uuid,
  p_tempo_minutos integer,
  p_questoes integer default 0,
  p_acertos integer default 0,
  p_observacao text default null
)
returns public.metas
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_meta public.metas;
  v_aluno_id uuid;
  v_tentativa integer;
  v_concluida_em timestamptz := now();
begin
  perform private.require_authenticated();

  select m.*
    into v_meta
  from public.metas m
  join public.planejamentos p on p.id = m.planejamento_id
  where m.id = p_meta_id
    and m.deleted_at is null
    and p.deleted_at is null
  for update of m;

  select aluno_id into v_aluno_id
  from public.planejamentos
  where id = v_meta.planejamento_id;

  if v_meta.id is null then
    raise exception 'meta não encontrada';
  end if;
  if auth.uid() is distinct from v_aluno_id and not public.eh_admin() then
    raise exception 'sem permissão para concluir meta';
  end if;
  if auth.uid() = v_aluno_id and not public.aluno_possui_acesso(v_aluno_id) then
    raise exception 'acesso do aluno não está liberado';
  end if;
  if v_meta.status not in ('pendente', 'em_andamento') then
    raise exception 'somente meta pendente ou em andamento pode ser concluída';
  end if;
  if p_tempo_minutos not between 1 and 1440 then
    raise exception 'tempo inválido';
  end if;
  if p_questoes < 0 or p_acertos < 0 or p_acertos > p_questoes then
    raise exception 'resultado inválido';
  end if;
  if v_meta.tipo in ('bloco', 'reforco') and p_questoes < 1 then
    raise exception 'meta exige ao menos uma questão';
  end if;
  if v_meta.tipo = 'extra' and (p_questoes <> 0 or p_acertos <> 0) then
    raise exception 'estudo extra não aceita questões ou acertos';
  end if;

  select coalesce(max(tentativa_numero), 0) + 1 into v_tentativa
  from public.meta_resultados
  where meta_id = p_meta_id;

  perform set_config('app.audit_reason', 'conclusão de meta', true);
  insert into public.meta_resultados (
    meta_id, tentativa_numero, tempo_gasto_minutos, questoes_feitas,
    acertos, observacao, concluida_em, created_by
  ) values (
    p_meta_id, v_tentativa, p_tempo_minutos, p_questoes,
    p_acertos, nullif(btrim(p_observacao), ''), v_concluida_em, auth.uid()
  );

  update public.metas
     set tempo_gasto_minutos = p_tempo_minutos,
         questoes_feitas = p_questoes,
         acertos = p_acertos,
         observacao_conclusao = nullif(btrim(p_observacao), ''),
         status = 'concluida',
         concluida_em = v_concluida_em
   where id = p_meta_id
   returning * into v_meta;
  return v_meta;
end;
$$;

create or replace function public.desfazer_conclusao_meta(
  p_meta_id uuid,
  p_motivo text
)
returns public.metas
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_meta public.metas;
  v_aluno_id uuid;
  v_resultado_id uuid;
begin
  perform private.require_authenticated();

  select m.*
    into v_meta
  from public.metas m
  join public.planejamentos p on p.id = m.planejamento_id
  where m.id = p_meta_id
    and m.deleted_at is null
    and p.deleted_at is null
  for update of m;

  select aluno_id into v_aluno_id
  from public.planejamentos
  where id = v_meta.planejamento_id;

  if v_meta.id is null then
    raise exception 'meta não encontrada';
  end if;
  if auth.uid() is distinct from v_aluno_id and not public.eh_admin() then
    raise exception 'sem permissão para desfazer meta';
  end if;
  if v_meta.status <> 'concluida' then
    raise exception 'somente meta concluída pode ser desfeita';
  end if;
  if length(btrim(coalesce(p_motivo, ''))) = 0 then
    raise exception 'motivo é obrigatório';
  end if;

  select id into v_resultado_id
  from public.meta_resultados
  where meta_id = p_meta_id and desfeita_em is null
  for update;

  if v_resultado_id is null then
    raise exception 'resultado vigente da meta não encontrado';
  end if;

  perform set_config('app.audit_reason', 'desfazimento de conclusão: ' || btrim(p_motivo), true);
  update public.meta_resultados
     set desfeita_em = now(),
         desfeita_por = auth.uid(),
         motivo_desfazer = btrim(p_motivo)
   where id = v_resultado_id;

  update public.metas
     set tempo_gasto_minutos = null,
         questoes_feitas = 0,
         acertos = 0,
         observacao_conclusao = null,
         status = 'pendente',
         concluida_em = null
   where id = p_meta_id
   returning * into v_meta;
  return v_meta;
end;
$$;

create or replace function public.agendar_reforco(
  p_meta_origem_id uuid,
  p_semana integer,
  p_dia smallint default null
)
returns public.metas
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_origem public.metas;
  v_aluno_id uuid;
  v_dia smallint;
  v_ordem integer;
  v_reforco public.metas;
  v_meta_percentual numeric(5,2);
  v_desempenho numeric(7,2);
begin
  perform private.require_authenticated();

  select m.*
    into v_origem
  from public.metas m
  join public.planejamentos p on p.id = m.planejamento_id
  where m.id = p_meta_origem_id
    and m.deleted_at is null
    and p.status = 'ativo'
    and p.deleted_at is null
  for update of m;

  select aluno_id into v_aluno_id
  from public.planejamentos
  where id = v_origem.planejamento_id;

  if v_origem.id is null then
    raise exception 'meta de origem vigente não encontrada';
  end if;
  if v_origem.status <> 'concluida'
     or v_origem.tipo <> 'bloco'
     or v_origem.questoes_feitas < 1 then
    raise exception 'somente bloco concluído com questões pode originar reforço';
  end if;
  if auth.uid() is distinct from v_aluno_id
     and not public.professor_tem_aluno(v_aluno_id)
     and not public.eh_admin() then
    raise exception 'sem permissão para agendar reforço';
  end if;
  if p_semana < 1 then
    raise exception 'semana inválida';
  end if;

  select meta_percentual into v_meta_percentual
  from public.planejamento_disciplinas
  where id = v_origem.planejamento_disciplina_id and deleted_at is null;

  v_desempenho := (v_origem.acertos::numeric * 100) / v_origem.questoes_feitas;
  if v_desempenho >= v_meta_percentual then
    raise exception 'meta de origem já atingiu o percentual exigido';
  end if;

  v_dia := coalesce(p_dia, v_origem.dia_semana);
  if v_dia not between 1 and 7 then
    raise exception 'dia inválido';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_origem.planejamento_id::text, 2));
  select coalesce(max(ordem_dia), 0) + 1 into v_ordem
  from public.metas
  where planejamento_id = v_origem.planejamento_id
    and semana_numero = p_semana
    and dia_semana = v_dia
    and deleted_at is null;

  perform set_config('app.audit_reason', 'agendamento de reforço', true);
  insert into public.metas (
    planejamento_id, planejamento_disciplina_id, planejamento_caderno_id,
    origem_meta_id, tipo, titulo, semana_numero, dia_semana, ordem_dia,
    tempo_previsto_minutos, created_by
  ) values (
    v_origem.planejamento_id, v_origem.planejamento_disciplina_id,
    v_origem.planejamento_caderno_id, v_origem.id, 'reforco',
    'Reforço - ' || v_origem.titulo, p_semana, v_dia, v_ordem,
    v_origem.tempo_previsto_minutos, auth.uid()
  ) returning * into v_reforco;

  update public.metas
     set reforco_ignorado_em = null
   where id = v_origem.id;
  return v_reforco;
end;
$$;

create or replace function public.cancelar_reforco(
  p_reforco_id uuid,
  p_motivo text
)
returns public.metas
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reforco public.metas;
  v_aluno_id uuid;
begin
  perform private.require_authenticated();

  select m.*
    into v_reforco
  from public.metas m
  join public.planejamentos p on p.id = m.planejamento_id
  where m.id = p_reforco_id and m.deleted_at is null
  for update of m;

  select aluno_id into v_aluno_id
  from public.planejamentos
  where id = v_reforco.planejamento_id;

  if v_reforco.id is null
     or v_reforco.tipo <> 'reforco'
     or v_reforco.status not in ('pendente', 'em_andamento') then
    raise exception 'somente reforço pendente ou em andamento pode ser cancelado';
  end if;
  if auth.uid() is distinct from v_aluno_id
     and not public.professor_tem_aluno(v_aluno_id)
     and not public.eh_admin() then
    raise exception 'sem permissão para cancelar reforço';
  end if;
  if length(btrim(coalesce(p_motivo, ''))) = 0 then
    raise exception 'motivo é obrigatório';
  end if;

  perform set_config('app.audit_reason', 'cancelamento de reforço: ' || btrim(p_motivo), true);
  update public.metas
     set status = 'cancelada'
   where id = p_reforco_id
   returning * into v_reforco;
  return v_reforco;
end;
$$;

create or replace function public.ignorar_reforco(
  p_meta_origem_id uuid,
  p_ignorar boolean default true
)
returns public.metas
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_meta public.metas;
  v_aluno_id uuid;
  v_meta_percentual numeric(5,2);
begin
  perform private.require_authenticated();

  select m.*
    into v_meta
  from public.metas m
  join public.planejamentos p on p.id = m.planejamento_id
  where m.id = p_meta_origem_id
    and m.deleted_at is null
    and p.deleted_at is null
  for update of m;

  select aluno_id into v_aluno_id
  from public.planejamentos
  where id = v_meta.planejamento_id;

  if v_meta.id is null
     or v_meta.tipo <> 'bloco'
     or v_meta.status <> 'concluida'
     or v_meta.questoes_feitas < 1 then
    raise exception 'meta não é origem elegível de reforço';
  end if;
  if auth.uid() is distinct from v_aluno_id then
    raise exception 'somente o próprio aluno pode ignorar reforço';
  end if;

  select meta_percentual into v_meta_percentual
  from public.planejamento_disciplinas
  where id = v_meta.planejamento_disciplina_id and deleted_at is null;

  if (v_meta.acertos::numeric * 100) / v_meta.questoes_feitas >= v_meta_percentual then
    raise exception 'meta atingiu o percentual e não possui sugestão de reforço';
  end if;

  perform set_config('app.audit_reason', 'alteração da preferência de reforço', true);
  update public.metas
     set reforco_ignorado_em = case when p_ignorar then now() else null end
   where id = p_meta_origem_id
   returning * into v_meta;
  return v_meta;
end;
$$;

create or replace function public.registrar_estudo_extra(
  p_planejamento_id uuid,
  p_semana integer,
  p_dia smallint,
  p_atividade text,
  p_tempo_minutos integer,
  p_observacao text default null
)
returns public.metas
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_aluno_id uuid;
  v_ordem integer;
  v_meta public.metas;
begin
  perform private.require_authenticated();

  select aluno_id into v_aluno_id
  from public.planejamentos
  where id = p_planejamento_id
    and status = 'ativo'
    and deleted_at is null
  for update;

  if v_aluno_id is null or auth.uid() is distinct from v_aluno_id then
    raise exception 'planejamento ativo inválido';
  end if;
  if not public.aluno_possui_acesso(v_aluno_id) then
    raise exception 'acesso do aluno não está liberado';
  end if;
  if p_semana < 1 or p_dia not between 1 and 7 then
    raise exception 'agenda inválida';
  end if;
  if length(btrim(coalesce(p_atividade, ''))) < 1 then
    raise exception 'atividade obrigatória';
  end if;
  if p_tempo_minutos not between 1 and 1440 then
    raise exception 'tempo inválido';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_planejamento_id::text, 2));
  select coalesce(max(ordem_dia), 0) + 1 into v_ordem
  from public.metas
  where planejamento_id = p_planejamento_id
    and semana_numero = p_semana
    and dia_semana = p_dia
    and deleted_at is null;

  perform set_config('app.audit_reason', 'registro de estudo extra', true);
  insert into public.metas (
    planejamento_id, tipo, titulo, descricao, atividade_extra,
    semana_numero, dia_semana, ordem_dia, tempo_previsto_minutos,
    tempo_gasto_minutos, observacao_conclusao, status, concluida_em,
    created_by
  ) values (
    p_planejamento_id, 'extra', 'Estudo extra - ' || btrim(p_atividade),
    null, btrim(p_atividade), p_semana, p_dia, v_ordem,
    least(p_tempo_minutos, 240), p_tempo_minutos,
    nullif(btrim(p_observacao), ''), 'concluida', now(), auth.uid()
  ) returning * into v_meta;

  insert into public.meta_resultados (
    meta_id, tentativa_numero, tempo_gasto_minutos, questoes_feitas,
    acertos, observacao, concluida_em, created_by
  ) values (
    v_meta.id, 1, p_tempo_minutos, 0, 0,
    nullif(btrim(p_observacao), ''), v_meta.concluida_em, auth.uid()
  );

  return v_meta;
end;
$$;

create or replace function public.substituir_metas_semana(
  p_planejamento_id uuid,
  p_semana integer,
  p_metas jsonb,
  p_replanejar_tudo boolean default false,
  p_confirmar_historico boolean default false
)
returns setof public.metas
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_planejamento public.planejamentos;
  v_item jsonb;
  v_ordem integer;
  v_meta public.metas;
  v_preservadas integer;
  v_concluidas integer;
  v_operation_id uuid := gen_random_uuid();
  v_tipo public.tipo_meta;
  v_pd_id uuid;
  v_pc_id uuid;
begin
  select * into v_planejamento
  from public.planejamentos
  where id = p_planejamento_id
    and status = 'ativo'
    and deleted_at is null
  for update;

  if v_planejamento.id is null then
    raise exception 'planejamento ativo não encontrado';
  end if;
  if not (
    public.professor_tem_aluno(v_planejamento.aluno_id)
    or public.eh_admin()
  ) then
    raise exception 'sem permissão para replanejar';
  end if;
  if p_semana < 1 then
    raise exception 'semana inválida';
  end if;
  if jsonb_typeof(p_metas) <> 'array' then
    raise exception 'lista de metas inválida';
  end if;

  select count(*) into v_concluidas
  from public.metas
  where planejamento_id = p_planejamento_id
    and semana_numero = p_semana
    and tipo in ('bloco', 'teoria')
    and status = 'concluida'
    and deleted_at is null;

  if p_replanejar_tudo and v_concluidas > 0 and not p_confirmar_historico then
    raise exception 'replanejamento completo exige confirmação do histórico concluído';
  end if;

  v_preservadas := case when p_replanejar_tudo then 0 else v_concluidas end;
  if v_preservadas + jsonb_array_length(p_metas) <> v_planejamento.metas_semanais then
    raise exception 'total final de metas normais deve ser exatamente %', v_planejamento.metas_semanais;
  end if;

  perform set_config('app.audit_reason', 'substituição de metas da semana', true);
  perform set_config('app.audit_operation_id', v_operation_id::text, true);

  update public.metas
     set deleted_at = now(),
         deleted_by = auth.uid(),
         delete_reason = case
           when p_replanejar_tudo then 'replanejamento completo da semana'
           else 'substituição comum da semana'
         end,
         delete_operation_id = v_operation_id
   where planejamento_id = p_planejamento_id
     and semana_numero = p_semana
     and tipo in ('bloco', 'teoria')
     and deleted_at is null
     and (
       p_replanejar_tudo
       or status in ('pendente', 'em_andamento', 'pulada')
     );

  for v_item in select value from jsonb_array_elements(p_metas) loop
    if coalesce((v_item ->> 'semana_numero')::integer, p_semana) <> p_semana then
      raise exception 'todas as metas devem pertencer à semana informada';
    end if;

    v_tipo := (v_item ->> 'tipo')::public.tipo_meta;
    if v_tipo not in ('bloco', 'teoria') then
      raise exception 'substituição semanal aceita somente bloco ou teoria';
    end if;

    v_pd_id := nullif(v_item ->> 'planejamento_disciplina_id', '')::uuid;
    v_pc_id := nullif(v_item ->> 'planejamento_caderno_id', '')::uuid;

    if not exists (
      select 1 from public.planejamento_disciplinas pd
      where pd.id = v_pd_id
        and pd.planejamento_id = p_planejamento_id
        and pd.ativo
        and pd.deleted_at is null
    ) then
      raise exception 'disciplina da meta não está ativa no planejamento';
    end if;

    if v_tipo = 'bloco' and not exists (
      select 1 from public.planejamento_cadernos pc
      where pc.id = v_pc_id
        and pc.planejamento_disciplina_id = v_pd_id
        and pc.ativo
        and pc.deleted_at is null
    ) then
      raise exception 'meta de bloco exige caderno ativo da disciplina';
    end if;

    if v_tipo = 'teoria' and v_planejamento.modelo_estudo = 'somente_blocos' then
      raise exception 'planejamento somente_blocos não aceita teoria';
    end if;

    select coalesce(max(ordem_dia), 0) + 1 into v_ordem
    from public.metas
    where planejamento_id = p_planejamento_id
      and semana_numero = p_semana
      and dia_semana = (v_item ->> 'dia_semana')::smallint
      and deleted_at is null;

    insert into public.metas (
      planejamento_id, planejamento_disciplina_id, planejamento_caderno_id,
      tipo, titulo, descricao, semana_numero, dia_semana, ordem_dia,
      tempo_previsto_minutos, status, created_by
    ) values (
      p_planejamento_id,
      v_pd_id,
      case when v_tipo = 'bloco' then v_pc_id else null end,
      v_tipo,
      coalesce(nullif(btrim(v_item ->> 'titulo'), ''), 'Meta'),
      nullif(btrim(v_item ->> 'descricao'), ''),
      p_semana,
      (v_item ->> 'dia_semana')::smallint,
      v_ordem,
      coalesce((v_item ->> 'tempo_previsto_minutos')::integer, 60),
      'pendente',
      auth.uid()
    ) returning * into v_meta;
    return next v_meta;
  end loop;
  return;
end;
$$;

-- -----------------------------------------------------------------------------
-- RPCs de progresso, revisões e lista de espera
-- -----------------------------------------------------------------------------

create or replace function public.registrar_progresso_aula(
  p_planejamento_aula_id uuid,
  p_teoria_concluida boolean default null,
  p_caderno_concluido boolean default null
)
returns public.progresso_aulas
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_aluno_id uuid;
  v_progresso public.progresso_aulas;
begin
  perform private.require_authenticated();

  select p.aluno_id into v_aluno_id
  from public.planejamento_aulas pa
  join public.planejamento_disciplinas pd on pd.id = pa.planejamento_disciplina_id
  join public.planejamentos p on p.id = pd.planejamento_id
  where pa.id = p_planejamento_aula_id
    and pa.deleted_at is null
    and pd.deleted_at is null
    and p.deleted_at is null;

  if v_aluno_id is null or auth.uid() is distinct from v_aluno_id then
    raise exception 'aula não pertence ao aluno autenticado';
  end if;
  if not public.aluno_possui_acesso(v_aluno_id) then
    raise exception 'acesso do aluno não está liberado';
  end if;

  perform set_config('app.audit_reason', 'registro de progresso da aula', true);
  insert into public.progresso_aulas (
    planejamento_aula_id, aluno_id, teoria_concluida_em, caderno_concluido_em
  ) values (
    p_planejamento_aula_id,
    v_aluno_id,
    case when p_teoria_concluida then now() else null end,
    case when p_caderno_concluido then now() else null end
  )
  on conflict (planejamento_aula_id, aluno_id) where deleted_at is null
  do update set
    teoria_concluida_em = case
      when p_teoria_concluida is null then progresso_aulas.teoria_concluida_em
      when p_teoria_concluida then now()
      else null
    end,
    caderno_concluido_em = case
      when p_caderno_concluido is null then progresso_aulas.caderno_concluido_em
      when p_caderno_concluido then now()
      else null
    end
  returning * into v_progresso;
  return v_progresso;
end;
$$;

create or replace function public.salvar_configuracao_revisao(
  p_planejamento_disciplina_id uuid,
  p_primeira_intervalo integer,
  p_segunda_intervalo integer,
  p_ativo boolean default true
)
returns public.configuracoes_revisao
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_planejamento_id uuid;
  v_aluno_id uuid;
  v_config public.configuracoes_revisao;
begin
  select pd.planejamento_id, p.aluno_id
    into v_planejamento_id, v_aluno_id
  from public.planejamento_disciplinas pd
  join public.planejamentos p on p.id = pd.planejamento_id
  where pd.id = p_planejamento_disciplina_id
    and pd.deleted_at is null
    and p.deleted_at is null;

  if v_planejamento_id is null
     or not (public.professor_tem_aluno(v_aluno_id) or public.eh_admin()) then
    raise exception 'sem permissão para configurar revisão';
  end if;

  perform set_config('app.audit_reason', 'configuração de revisão', true);
  insert into public.configuracoes_revisao (
    planejamento_disciplina_id, primeira_revisao_intervalo,
    segunda_revisao_intervalo, ativo, updated_by
  ) values (
    p_planejamento_disciplina_id, p_primeira_intervalo,
    p_segunda_intervalo, p_ativo, auth.uid()
  )
  on conflict (planejamento_disciplina_id) where deleted_at is null
  do update set
    primeira_revisao_intervalo = excluded.primeira_revisao_intervalo,
    segunda_revisao_intervalo = excluded.segunda_revisao_intervalo,
    ativo = excluded.ativo,
    updated_by = auth.uid()
  returning * into v_config;
  return v_config;
end;
$$;

create or replace function public.concluir_revisao(
  p_revisao_id uuid,
  p_concluir boolean default true
)
returns public.revisoes
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_revisao public.revisoes;
begin
  perform private.require_authenticated();

  select * into v_revisao
  from public.revisoes
  where id = p_revisao_id and deleted_at is null
  for update;

  if v_revisao.id is null then
    raise exception 'revisão não encontrada';
  end if;
  if v_revisao.aluno_id is distinct from auth.uid()
     and not public.eh_admin() then
    raise exception 'sem permissão para alterar revisão';
  end if;
  if p_concluir and v_revisao.status <> 'pendente' then
    raise exception 'somente revisão pendente pode ser concluída';
  end if;
  if not p_concluir and v_revisao.status <> 'concluida' then
    raise exception 'somente revisão concluída pode ser desfeita';
  end if;

  perform set_config('app.audit_reason', 'alteração de conclusão da revisão', true);
  update public.revisoes
     set status = case
           when p_concluir then 'concluida'::public.status_revisao
           else 'pendente'::public.status_revisao
         end,
         concluida_em = case when p_concluir then now() else null end
   where id = p_revisao_id
   returning * into v_revisao;
  return v_revisao;
end;
$$;

create or replace function public.atualizar_minha_lista_espera(
  p_whatsapp text,
  p_area_interesse text,
  p_concurso_foco text
)
returns public.lista_espera
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item public.lista_espera;
begin
  if not exists (
    select 1 from public.profiles
    where id = auth.uid()
      and tipo = 'aluno'
      and ativo
      and deleted_at is null
  ) then
    raise exception 'somente aluno ativo pode usar lista de espera';
  end if;

  perform set_config('app.audit_reason', 'atualização da própria lista de espera', true);
  insert into public.lista_espera (
    aluno_id, whatsapp, area_interesse, concurso_foco
  ) values (
    auth.uid(), btrim(p_whatsapp), btrim(p_area_interesse), btrim(p_concurso_foco)
  )
  on conflict (aluno_id) where deleted_at is null
  do update set
    whatsapp = excluded.whatsapp,
    area_interesse = excluded.area_interesse,
    concurso_foco = excluded.concurso_foco
  returning * into v_item;
  return v_item;
end;
$$;

create or replace function public.administrar_lista_espera(
  p_lista_id uuid,
  p_status public.status_lista_espera,
  p_professor_id uuid default null
)
returns public.lista_espera
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item public.lista_espera;
  v_aluno_id uuid;
  v_professor_id uuid;
begin
  select aluno_id into v_aluno_id
  from public.lista_espera
  where id = p_lista_id and deleted_at is null;

  if v_aluno_id is null
     or not (public.professor_tem_aluno(v_aluno_id) or public.eh_admin()) then
    raise exception 'sem permissão para administrar lista de espera';
  end if;

  v_professor_id := case
    when public.eh_admin() then p_professor_id
    else auth.uid()
  end;

  perform set_config('app.audit_reason', 'administração de lista de espera', true);
  update public.lista_espera
     set status = p_status,
         professor_id = coalesce(v_professor_id, professor_id)
   where id = p_lista_id
   returning * into v_item;
  return v_item;
end;
$$;

-- -----------------------------------------------------------------------------
-- Row Level Security: leitura; toda mutação ocorre por RPC
-- -----------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.professor_alunos enable row level security;
alter table public.acessos_aluno enable row level security;
alter table public.cursos enable row level security;
alter table public.disciplinas enable row level security;
alter table public.curso_disciplinas enable row level security;
alter table public.cadernos_catalogo enable row level security;
alter table public.aulas_catalogo enable row level security;
alter table public.materiais_aula enable row level security;
alter table public.planejamentos enable row level security;
alter table public.planejamento_disciplinas enable row level security;
alter table public.planejamento_cadernos enable row level security;
alter table public.planejamento_aulas enable row level security;
alter table public.metas enable row level security;
alter table public.meta_resultados enable row level security;
alter table public.progresso_aulas enable row level security;
alter table public.configuracoes_revisao enable row level security;
alter table public.revisoes enable row level security;
alter table public.lista_espera enable row level security;
alter table public.audit_events enable row level security;

create policy profiles_select on public.profiles
for select to authenticated
using (
  deleted_at is null
  and (
    id = auth.uid()
    or public.professor_tem_aluno(id)
    or public.eh_admin()
  )
);

create policy vinculos_select on public.professor_alunos
for select to authenticated
using (
  deleted_at is null
  and (
    professor_id = auth.uid()
    or aluno_id = auth.uid()
    or public.eh_admin()
  )
);

create policy acessos_select on public.acessos_aluno
for select to authenticated
using (
  deleted_at is null
  and (
    aluno_id = auth.uid()
    or public.professor_tem_aluno(aluno_id)
    or public.eh_admin()
  )
);

create policy catalogo_cursos_select on public.cursos
for select to authenticated using (deleted_at is null and (ativo or public.eh_admin()));
create policy catalogo_disciplinas_select on public.disciplinas
for select to authenticated using (deleted_at is null and (ativo or public.eh_admin()));
create policy catalogo_curso_disciplinas_select on public.curso_disciplinas
for select to authenticated using (deleted_at is null and (ativo or public.eh_admin()));
create policy catalogo_cadernos_select on public.cadernos_catalogo
for select to authenticated using (deleted_at is null and (ativo or public.eh_admin()));
create policy catalogo_aulas_select on public.aulas_catalogo
for select to authenticated using (deleted_at is null and (ativo or public.eh_admin()));
create policy catalogo_materiais_select on public.materiais_aula
for select to authenticated
using (
  deleted_at is null
  and (
    public.eh_admin()
    or exists (
      select 1 from public.aulas_catalogo a
      where a.id = aula_id and a.ativo and a.deleted_at is null
    )
  )
);

create policy planejamentos_select on public.planejamentos
for select to authenticated
using (public.pode_acessar_planejamento(id));

create policy planejamento_disciplinas_select on public.planejamento_disciplinas
for select to authenticated
using (
  deleted_at is null
  and public.pode_acessar_planejamento(planejamento_id)
);

create policy planejamento_cadernos_select on public.planejamento_cadernos
for select to authenticated
using (
  deleted_at is null
  and exists (
    select 1
    from public.planejamento_disciplinas pd
    where pd.id = planejamento_disciplina_id
      and pd.deleted_at is null
      and public.pode_acessar_planejamento(pd.planejamento_id)
  )
);

create policy planejamento_aulas_select on public.planejamento_aulas
for select to authenticated
using (
  deleted_at is null
  and exists (
    select 1
    from public.planejamento_disciplinas pd
    where pd.id = planejamento_disciplina_id
      and pd.deleted_at is null
      and public.pode_acessar_planejamento(pd.planejamento_id)
  )
);

create policy metas_select on public.metas
for select to authenticated
using (
  deleted_at is null
  and public.pode_acessar_planejamento(planejamento_id)
);

create policy meta_resultados_select on public.meta_resultados
for select to authenticated
using (
  exists (
    select 1
    from public.metas m
    where m.id = meta_id
      and m.deleted_at is null
      and public.pode_acessar_planejamento(m.planejamento_id)
  )
);

create policy progresso_aulas_select on public.progresso_aulas
for select to authenticated
using (
  deleted_at is null
  and (
    aluno_id = auth.uid()
    or public.professor_tem_aluno(aluno_id)
    or public.eh_admin()
  )
);

create policy configuracoes_revisao_select on public.configuracoes_revisao
for select to authenticated
using (
  deleted_at is null
  and exists (
    select 1
    from public.planejamento_disciplinas pd
    where pd.id = planejamento_disciplina_id
      and pd.deleted_at is null
      and public.pode_acessar_planejamento(pd.planejamento_id)
  )
);

create policy revisoes_select on public.revisoes
for select to authenticated
using (
  deleted_at is null
  and (
    aluno_id = auth.uid()
    or public.professor_tem_aluno(aluno_id)
    or public.eh_admin()
  )
);

create policy lista_espera_select on public.lista_espera
for select to authenticated
using (
  deleted_at is null
  and (
    aluno_id = auth.uid()
    or public.professor_tem_aluno(aluno_id)
    or public.eh_admin()
  )
);

create policy audit_events_admin_select on public.audit_events
for select to authenticated
using (public.eh_admin());

do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'profiles', 'professor_alunos', 'acessos_aluno', 'cursos', 'disciplinas',
    'curso_disciplinas', 'cadernos_catalogo', 'aulas_catalogo', 'materiais_aula',
    'planejamentos', 'planejamento_disciplinas', 'planejamento_cadernos',
    'planejamento_aulas', 'metas', 'meta_resultados', 'progresso_aulas',
    'configuracoes_revisao', 'revisoes', 'lista_espera'
  ] loop
    execute format(
      'create policy %I on public.%I for select to authenticated using (public.eh_admin())',
      v_table || '_admin_all',
      v_table
    );
  end loop;
end;
$$;

-- -----------------------------------------------------------------------------
-- Privilégios: leitura por RLS e escrita somente por RPC
-- -----------------------------------------------------------------------------

revoke all on all tables in schema public from anon, authenticated;
revoke all on all functions in schema public from public, anon, authenticated;
revoke all on all functions in schema private from public, anon, authenticated;

grant usage on schema public to authenticated;

grant select on public.profiles, public.professor_alunos, public.acessos_aluno,
  public.cursos, public.disciplinas, public.curso_disciplinas,
  public.cadernos_catalogo, public.aulas_catalogo, public.materiais_aula,
  public.planejamentos, public.planejamento_disciplinas,
  public.planejamento_cadernos, public.planejamento_aulas, public.metas,
  public.meta_resultados, public.progresso_aulas,
  public.configuracoes_revisao, public.revisoes, public.lista_espera,
  public.audit_events, public.acessos_aluno_efetivos
to authenticated;

grant execute on all functions in schema public to authenticated;

commit;
