begin;

create extension if not exists pgcrypto;

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

-- -----------------------------------------------------------------------------
-- Funções utilitárias
-- -----------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- Usuários, vínculos e acesso
-- -----------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nome text not null check (length(btrim(nome)) >= 2),
  tipo public.tipo_perfil not null default 'aluno',
  telefone text,
  fuso_horario text not null default 'America/Sao_Paulo',
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.professor_alunos (
  id uuid primary key default gen_random_uuid(),
  professor_id uuid not null references public.profiles(id) on delete restrict,
  aluno_id uuid not null references public.profiles(id) on delete cascade,
  status public.status_vinculo not null default 'ativo',
  inicio_em date not null default current_date,
  fim_em date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ck_professor_aluno_distintos check (professor_id <> aluno_id),
  constraint ck_vinculo_datas check (fim_em is null or fim_em >= inicio_em)
);

create unique index uq_professor_alunos_vinculo_ativo
  on public.professor_alunos (aluno_id)
  where status = 'ativo';

create index ix_professor_alunos_professor
  on public.professor_alunos (professor_id, status);

create table public.acessos_aluno (
  id uuid primary key default gen_random_uuid(),
  aluno_id uuid not null references public.profiles(id) on delete cascade,
  status public.status_acesso not null default 'pendente',
  plano text not null default 'manual',
  inicio_em date,
  expira_em date,
  bloqueado_em timestamptz,
  motivo_bloqueio text,
  liberado_por uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ck_acesso_datas check (
    expira_em is null or inicio_em is null or expira_em >= inicio_em
  ),
  constraint ck_acesso_bloqueio check (
    status <> 'bloqueado' or bloqueado_em is not null
  )
);

create unique index uq_acesso_corrente_aluno
  on public.acessos_aluno (aluno_id)
  where status in ('pendente', 'ativo', 'bloqueado');

create index ix_acessos_aluno_status_expiracao
  on public.acessos_aluno (aluno_id, status, expira_em);

-- -----------------------------------------------------------------------------
-- Catálogo acadêmico
-- -----------------------------------------------------------------------------

create table public.cursos (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique,
  nome text not null,
  area text,
  concurso_alvo text,
  fase public.fase_curso not null default 'pre_edital',
  modelo_estudo public.modelo_estudo not null default 'teoria_blocos',
  metas_semanais_padrao integer not null default 24
    check (metas_semanais_padrao between 1 and 100),
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.disciplinas (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique,
  nome text not null,
  cor_padrao varchar(7) not null default '#2563EB'
    check (cor_padrao ~ '^#[0-9A-Fa-f]{6}$'),
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.curso_disciplinas (
  id uuid primary key default gen_random_uuid(),
  curso_id uuid not null references public.cursos(id) on delete cascade,
  disciplina_id uuid not null references public.disciplinas(id) on delete restrict,
  modalidade public.modalidade_disciplina not null default 'blocos',
  meta_padrao numeric(5,2) not null default 80 check (meta_padrao between 0 and 100),
  peso_padrao numeric(8,2) not null default 1 check (peso_padrao > 0),
  ordem integer not null default 0 check (ordem >= 0),
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (curso_id, disciplina_id)
);

create table public.cadernos_catalogo (
  id uuid primary key default gen_random_uuid(),
  curso_disciplina_id uuid not null references public.curso_disciplinas(id) on delete cascade,
  nome text not null,
  link_tec text,
  total_questoes integer not null default 0 check (total_questoes >= 0),
  ordem integer not null default 0 check (ordem >= 0),
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (curso_disciplina_id, ordem)
);

create table public.aulas_catalogo (
  id uuid primary key default gen_random_uuid(),
  curso_disciplina_id uuid not null references public.curso_disciplinas(id) on delete cascade,
  nome text not null,
  ordem integer not null default 0 check (ordem >= 0),
  link_tec text,
  total_questoes integer not null default 0 check (total_questoes >= 0),
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (curso_disciplina_id, ordem)
);

create table public.materiais_aula (
  id uuid primary key default gen_random_uuid(),
  aula_id uuid not null references public.aulas_catalogo(id) on delete cascade,
  tipo public.tipo_material not null default 'pdf',
  nome text not null,
  url text,
  ordem integer not null default 0 check (ordem >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (aula_id, ordem)
);

-- -----------------------------------------------------------------------------
-- Planejamentos e suas cópias configuráveis
-- -----------------------------------------------------------------------------

create table public.planejamentos (
  id uuid primary key default gen_random_uuid(),
  professor_id uuid not null references public.profiles(id) on delete restrict,
  aluno_id uuid not null references public.profiles(id) on delete cascade,
  curso_id uuid not null references public.cursos(id) on delete restrict,
  nome text not null,
  fase public.fase_curso not null default 'pre_edital',
  modelo_estudo public.modelo_estudo not null default 'teoria_blocos',
  metas_semanais integer not null default 24 check (metas_semanais between 1 and 100),
  data_inicio date not null default current_date,
  status public.status_planejamento not null default 'ativo',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (aluno_id, nome)
);

create unique index uq_planejamento_ativo_aluno
  on public.planejamentos (aluno_id)
  where status = 'ativo';

create index ix_planejamentos_professor_aluno
  on public.planejamentos (professor_id, aluno_id, status);

create table public.planejamento_disciplinas (
  id uuid primary key default gen_random_uuid(),
  planejamento_id uuid not null references public.planejamentos(id) on delete cascade,
  disciplina_id uuid not null references public.disciplinas(id) on delete restrict,
  modalidade public.modalidade_disciplina not null default 'blocos',
  meta_percentual numeric(5,2) not null default 80 check (meta_percentual between 0 and 100),
  peso numeric(8,2) not null default 1 check (peso > 0),
  minimo_metas integer not null default 0 check (minimo_metas >= 0),
  maximo_metas integer not null default 8 check (maximo_metas >= 0),
  ordem integer not null default 0 check (ordem >= 0),
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ck_planejamento_disciplina_limites check (maximo_metas >= minimo_metas),
  unique (planejamento_id, disciplina_id)
);

create table public.planejamento_cadernos (
  id uuid primary key default gen_random_uuid(),
  planejamento_disciplina_id uuid not null references public.planejamento_disciplinas(id) on delete cascade,
  caderno_catalogo_id uuid references public.cadernos_catalogo(id) on delete set null,
  nome text not null,
  link_tec text,
  total_questoes integer not null default 0 check (total_questoes >= 0),
  ordem integer not null default 0 check (ordem >= 0),
  ativo boolean not null default true,
  excluido_em timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (planejamento_disciplina_id, ordem)
);

create index ix_planejamento_cadernos_ativos
  on public.planejamento_cadernos (planejamento_disciplina_id, ordem)
  where ativo = true and excluido_em is null;

create table public.planejamento_aulas (
  id uuid primary key default gen_random_uuid(),
  planejamento_disciplina_id uuid not null references public.planejamento_disciplinas(id) on delete cascade,
  aula_catalogo_id uuid references public.aulas_catalogo(id) on delete set null,
  nome text not null,
  ordem integer not null default 0 check (ordem >= 0),
  link_tec text,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (planejamento_disciplina_id, ordem)
);

-- -----------------------------------------------------------------------------
-- Metas, reforços e estudos extras
-- -----------------------------------------------------------------------------

create table public.metas (
  id uuid primary key default gen_random_uuid(),
  planejamento_id uuid not null references public.planejamentos(id) on delete cascade,
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
  status public.status_meta not null default 'pendente',
  concluida_em timestamptz,
  reforco_ignorado_em timestamptz,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (planejamento_id, semana_numero, dia_semana, ordem_dia),
  constraint ck_meta_tipo_referencias check (
    (tipo = 'bloco' and planejamento_disciplina_id is not null and planejamento_caderno_id is not null and origem_meta_id is null and atividade_extra is null)
    or (tipo = 'teoria' and planejamento_disciplina_id is not null and planejamento_caderno_id is null and origem_meta_id is null and atividade_extra is null)
    or (tipo = 'reforco' and planejamento_disciplina_id is not null and origem_meta_id is not null and atividade_extra is null)
    or (tipo = 'extra' and planejamento_disciplina_id is null and planejamento_caderno_id is null and origem_meta_id is null and length(btrim(atividade_extra)) > 0)
  ),
  constraint ck_meta_conclusao check (
    (status = 'concluida' and concluida_em is not null and tempo_gasto_minutos is not null)
    or (status <> 'concluida' and concluida_em is null)
  ),
  constraint ck_meta_questoes_conclusao check (
    status <> 'concluida'
    or tipo in ('teoria', 'extra')
    or questoes_feitas > 0
  )
);

create index ix_metas_planejamento_agenda
  on public.metas (planejamento_id, semana_numero, dia_semana, ordem_dia);

create index ix_metas_planejamento_status
  on public.metas (planejamento_id, status, tipo);

create unique index uq_reforco_pendente_origem
  on public.metas (origem_meta_id)
  where tipo = 'reforco' and status in ('pendente', 'em_andamento');

-- -----------------------------------------------------------------------------
-- Aulas e revisões
-- -----------------------------------------------------------------------------

create table public.progresso_aulas (
  id uuid primary key default gen_random_uuid(),
  planejamento_aula_id uuid not null references public.planejamento_aulas(id) on delete cascade,
  aluno_id uuid not null references public.profiles(id) on delete cascade,
  teoria_concluida_em timestamptz,
  caderno_concluido_em timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (planejamento_aula_id, aluno_id)
);

create table public.configuracoes_revisao (
  id uuid primary key default gen_random_uuid(),
  planejamento_disciplina_id uuid not null unique references public.planejamento_disciplinas(id) on delete cascade,
  primeira_revisao_intervalo integer not null default 0
    check (primeira_revisao_intervalo between 0 and 60),
  segunda_revisao_intervalo integer not null default 0
    check (segunda_revisao_intervalo between 0 and 60),
  ativo boolean not null default true,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.revisoes (
  id uuid primary key default gen_random_uuid(),
  planejamento_aula_origem_id uuid not null references public.planejamento_aulas(id) on delete cascade,
  planejamento_aula_revisada_id uuid not null references public.planejamento_aulas(id) on delete cascade,
  aluno_id uuid not null references public.profiles(id) on delete cascade,
  etapa public.etapa_revisao not null,
  status public.status_revisao not null default 'pendente',
  prevista_em date,
  concluida_em timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ck_revisao_aulas_distintas check (planejamento_aula_origem_id <> planejamento_aula_revisada_id),
  constraint ck_revisao_conclusao check (
    (status = 'concluida' and concluida_em is not null)
    or (status <> 'concluida' and concluida_em is null)
  ),
  unique (planejamento_aula_origem_id, planejamento_aula_revisada_id, aluno_id, etapa)
);

-- -----------------------------------------------------------------------------
-- Lista de espera
-- -----------------------------------------------------------------------------

create table public.lista_espera (
  id uuid primary key default gen_random_uuid(),
  aluno_id uuid not null unique references public.profiles(id) on delete cascade,
  professor_id uuid references public.profiles(id) on delete set null,
  whatsapp text not null,
  area_interesse text not null,
  concurso_foco text not null,
  status public.status_lista_espera not null default 'aguardando',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- Validações entre tabelas
-- -----------------------------------------------------------------------------

create or replace function public.validar_vinculo_professor_aluno()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if not exists (select 1 from public.profiles where id = new.professor_id and tipo = 'professor' and ativo) then
    raise exception 'professor_id não referencia um professor ativo';
  end if;
  if not exists (select 1 from public.profiles where id = new.aluno_id and tipo = 'aluno' and ativo) then
    raise exception 'aluno_id não referencia um aluno ativo';
  end if;
  return new;
end;
$$;

create trigger trg_validar_vinculo_professor_aluno
before insert or update on public.professor_alunos
for each row execute function public.validar_vinculo_professor_aluno();

create or replace function public.validar_planejamento()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if not exists (
    select 1
    from public.professor_alunos pa
    where pa.professor_id = new.professor_id
      and pa.aluno_id = new.aluno_id
      and pa.status = 'ativo'
  ) then
    raise exception 'professor e aluno não possuem vínculo ativo';
  end if;

  if new.status = 'ativo' then
    update public.planejamentos
       set status = 'arquivado', updated_at = now()
     where aluno_id = new.aluno_id
       and id <> new.id
       and status = 'ativo';
  end if;
  return new;
end;
$$;

create trigger trg_validar_planejamento
before insert or update of professor_id, aluno_id, status on public.planejamentos
for each row execute function public.validar_planejamento();

create or replace function public.validar_meta_relacionamentos()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_planejamento_disciplina uuid;
  v_planejamento_caderno uuid;
  v_origem_planejamento uuid;
begin
  if new.planejamento_disciplina_id is not null then
    select planejamento_id
      into v_planejamento_disciplina
      from public.planejamento_disciplinas
     where id = new.planejamento_disciplina_id;
    if v_planejamento_disciplina is distinct from new.planejamento_id then
      raise exception 'disciplina não pertence ao planejamento da meta';
    end if;
  end if;

  if new.planejamento_caderno_id is not null then
    select pd.planejamento_id
      into v_planejamento_caderno
      from public.planejamento_cadernos pc
      join public.planejamento_disciplinas pd on pd.id = pc.planejamento_disciplina_id
     where pc.id = new.planejamento_caderno_id
       and pc.planejamento_disciplina_id = new.planejamento_disciplina_id;
    if v_planejamento_caderno is distinct from new.planejamento_id then
      raise exception 'caderno não pertence à disciplina e ao planejamento da meta';
    end if;
  end if;

  if new.origem_meta_id is not null then
    select planejamento_id into v_origem_planejamento
      from public.metas where id = new.origem_meta_id;
    if v_origem_planejamento is distinct from new.planejamento_id then
      raise exception 'reforço e meta de origem devem pertencer ao mesmo planejamento';
    end if;
  end if;
  return new;
end;
$$;

create trigger trg_validar_meta_relacionamentos
before insert or update on public.metas
for each row execute function public.validar_meta_relacionamentos();

create or replace function public.validar_progresso_aula()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_aluno_id uuid;
begin
  select p.aluno_id into v_aluno_id
    from public.planejamento_aulas pa
    join public.planejamento_disciplinas pd on pd.id = pa.planejamento_disciplina_id
    join public.planejamentos p on p.id = pd.planejamento_id
   where pa.id = new.planejamento_aula_id;
  if v_aluno_id is distinct from new.aluno_id then
    raise exception 'progresso da aula não pertence ao aluno do planejamento';
  end if;
  return new;
end;
$$;

create trigger trg_validar_progresso_aula
before insert or update on public.progresso_aulas
for each row execute function public.validar_progresso_aula();

create or replace function public.validar_revisao()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_plano_origem uuid;
  v_plano_revisada uuid;
  v_aluno_id uuid;
begin
  select pd.planejamento_id into v_plano_origem
    from public.planejamento_aulas pa
    join public.planejamento_disciplinas pd on pd.id = pa.planejamento_disciplina_id
   where pa.id = new.planejamento_aula_origem_id;

  select pd.planejamento_id into v_plano_revisada
    from public.planejamento_aulas pa
    join public.planejamento_disciplinas pd on pd.id = pa.planejamento_disciplina_id
   where pa.id = new.planejamento_aula_revisada_id;

  if v_plano_origem is distinct from v_plano_revisada then
    raise exception 'aulas da revisão devem pertencer ao mesmo planejamento';
  end if;

  select aluno_id into v_aluno_id from public.planejamentos where id = v_plano_origem;
  if v_aluno_id is distinct from new.aluno_id then
    raise exception 'revisão não pertence ao aluno do planejamento';
  end if;
  return new;
end;
$$;

create trigger trg_validar_revisao
before insert or update on public.revisoes
for each row execute function public.validar_revisao();

-- -----------------------------------------------------------------------------
-- Atualização automática de updated_at
-- -----------------------------------------------------------------------------

do $$
declare
  v_tabela text;
begin
  foreach v_tabela in array array[
    'profiles', 'professor_alunos', 'acessos_aluno', 'cursos', 'disciplinas',
    'curso_disciplinas', 'cadernos_catalogo', 'aulas_catalogo', 'materiais_aula',
    'planejamentos', 'planejamento_disciplinas', 'planejamento_cadernos',
    'planejamento_aulas', 'metas', 'progresso_aulas', 'configuracoes_revisao',
    'revisoes', 'lista_espera'
  ] loop
    execute format(
      'create trigger %I before update on public.%I for each row execute function public.set_updated_at()',
      'trg_' || v_tabela || '_updated_at',
      v_tabela
    );
  end loop;
end;
$$;

-- -----------------------------------------------------------------------------
-- Perfil automático para novos usuários do Supabase Auth
-- -----------------------------------------------------------------------------

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, nome, tipo)
  values (
    new.id,
    coalesce(
      nullif(btrim(new.raw_user_meta_data ->> 'nome'), ''),
      nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''),
      split_part(coalesce(new.email, 'Usuário'), '@', 1)
    ),
    'aluno'
  )
  on conflict (id) do nothing;

  insert into public.acessos_aluno (aluno_id, status, plano)
  values (new.id, 'pendente', 'manual')
  on conflict do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_auth_user();

-- -----------------------------------------------------------------------------
-- Funções auxiliares de autorização para RLS
-- -----------------------------------------------------------------------------

create or replace function public.eh_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and tipo = 'admin' and ativo
  );
$$;

create or replace function public.professor_tem_aluno(p_aluno_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.professor_alunos
    where professor_id = auth.uid()
      and aluno_id = p_aluno_id
      and status = 'ativo'
  );
$$;

create or replace function public.pode_acessar_planejamento(p_planejamento_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.planejamentos p
    where p.id = p_planejamento_id
      and (
        p.aluno_id = auth.uid()
        or p.professor_id = auth.uid()
        or public.eh_admin()
      )
  );
$$;

create or replace function public.aluno_possui_acesso(p_aluno_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.acessos_aluno a
    where a.aluno_id = p_aluno_id
      and a.status = 'ativo'
      and coalesce(a.inicio_em, current_date) <= current_date
      and (a.expira_em is null or a.expira_em >= current_date)
  );
$$;

-- -----------------------------------------------------------------------------
-- RPCs de negócio
-- -----------------------------------------------------------------------------

create or replace function public.atualizar_meu_perfil(
  p_nome text,
  p_telefone text default null,
  p_fuso_horario text default 'America/Sao_Paulo'
)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_perfil public.profiles;
begin
  if auth.uid() is null then raise exception 'usuário não autenticado'; end if;
  if length(btrim(coalesce(p_nome, ''))) < 2 then raise exception 'nome inválido'; end if;

  update public.profiles
     set nome = btrim(p_nome),
         telefone = nullif(btrim(p_telefone), ''),
         fuso_horario = coalesce(nullif(btrim(p_fuso_horario), ''), 'America/Sao_Paulo')
   where id = auth.uid()
   returning * into v_perfil;
  return v_perfil;
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
set search_path = public
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

  update public.acessos_aluno
     set status = 'expirado', updated_at = now()
   where aluno_id = p_aluno_id
     and status in ('pendente', 'ativo', 'bloqueado');

  insert into public.acessos_aluno (
    aluno_id, status, plano, inicio_em, expira_em, liberado_por
  ) values (
    p_aluno_id,
    'ativo',
    coalesce(nullif(btrim(p_plano), ''), 'manual'),
    current_date,
    case when p_sem_expiracao then null else (current_date + make_interval(months => p_meses))::date end,
    auth.uid()
  ) returning * into v_acesso;
  return v_acesso;
end;
$$;

create or replace function public.bloquear_acesso(p_aluno_id uuid, p_motivo text default null)
returns public.acessos_aluno
language plpgsql
security definer
set search_path = public
as $$
declare
  v_acesso public.acessos_aluno;
begin
  if not (public.eh_admin() or public.professor_tem_aluno(p_aluno_id)) then
    raise exception 'sem permissão para bloquear este aluno';
  end if;
  update public.acessos_aluno
     set status = 'bloqueado',
         bloqueado_em = now(),
         motivo_bloqueio = nullif(btrim(p_motivo), '')
   where aluno_id = p_aluno_id
     and status in ('pendente', 'ativo')
   returning * into v_acesso;
  if v_acesso.id is null then raise exception 'acesso corrente não encontrado'; end if;
  return v_acesso;
end;
$$;

create or replace function public.renovar_acesso(p_aluno_id uuid, p_meses integer default 3)
returns public.acessos_aluno
language plpgsql
security definer
set search_path = public
as $$
declare
  v_acesso public.acessos_aluno;
begin
  if not (public.eh_admin() or public.professor_tem_aluno(p_aluno_id)) then
    raise exception 'sem permissão para renovar este aluno';
  end if;
  if coalesce(p_meses, 0) < 1 then raise exception 'meses deve ser maior que zero'; end if;

  update public.acessos_aluno
     set status = 'ativo',
         inicio_em = coalesce(inicio_em, current_date),
         expira_em = (greatest(coalesce(expira_em, current_date), current_date)
                      + make_interval(months => p_meses))::date,
         bloqueado_em = null,
         motivo_bloqueio = null,
         liberado_por = auth.uid()
   where aluno_id = p_aluno_id
     and status in ('pendente', 'ativo', 'bloqueado')
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
set search_path = public
as $$
declare
  v_acesso public.acessos_aluno;
begin
  if not (public.eh_admin() or public.professor_tem_aluno(p_aluno_id)) then
    raise exception 'sem permissão para cancelar este aluno';
  end if;
  update public.acessos_aluno
     set status = 'cancelado'
   where aluno_id = p_aluno_id
     and status in ('pendente', 'ativo', 'bloqueado')
   returning * into v_acesso;
  if v_acesso.id is null then raise exception 'acesso corrente não encontrado'; end if;
  return v_acesso;
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
set search_path = public
as $$
declare
  v_meta public.metas;
  v_aluno_id uuid;
begin
  select m.* into v_meta
    from public.metas m
   where m.id = p_meta_id
   for update;

  if v_meta.id is null then raise exception 'meta não encontrada'; end if;
  select aluno_id into v_aluno_id
    from public.planejamentos where id = v_meta.planejamento_id;
  if not (auth.uid() = v_aluno_id or public.eh_admin()) then raise exception 'sem permissão'; end if;
  if not public.aluno_possui_acesso(v_aluno_id) then raise exception 'acesso do aluno não está liberado'; end if;
  if p_tempo_minutos not between 1 and 1440 then raise exception 'tempo inválido'; end if;
  if p_questoes < 0 or p_acertos < 0 or p_acertos > p_questoes then raise exception 'resultado inválido'; end if;
  if v_meta.tipo in ('bloco', 'reforco') and p_questoes < 1 then raise exception 'meta exige ao menos uma questão'; end if;

  update public.metas
     set tempo_gasto_minutos = p_tempo_minutos,
         questoes_feitas = p_questoes,
         acertos = p_acertos,
         descricao = nullif(btrim(p_observacao), ''),
         status = 'concluida',
         concluida_em = coalesce(concluida_em, now())
   where id = p_meta_id
   returning * into v_meta;
  return v_meta;
end;
$$;

create or replace function public.desfazer_conclusao_meta(p_meta_id uuid)
returns public.metas
language plpgsql
security definer
set search_path = public
as $$
declare
  v_meta public.metas;
  v_aluno_id uuid;
begin
  select m.* into v_meta
    from public.metas m
   where m.id = p_meta_id
   for update;
  if v_meta.id is null then raise exception 'meta não encontrada'; end if;
  select aluno_id into v_aluno_id
    from public.planejamentos where id = v_meta.planejamento_id;
  if not (auth.uid() = v_aluno_id or public.eh_admin()) then raise exception 'sem permissão'; end if;

  update public.metas
     set tempo_gasto_minutos = null,
         questoes_feitas = 0,
         acertos = 0,
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
set search_path = public
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
  select m.* into v_origem
    from public.metas m
   where m.id = p_meta_origem_id
   for update;

  if v_origem.id is null then raise exception 'meta de origem não encontrada'; end if;
  select aluno_id into v_aluno_id
    from public.planejamentos where id = v_origem.planejamento_id;
  if v_origem.status <> 'concluida' or v_origem.tipo <> 'bloco' then
    raise exception 'somente meta original de bloco concluída pode originar reforço';
  end if;
  if not (auth.uid() = v_aluno_id or public.professor_tem_aluno(v_aluno_id) or public.eh_admin()) then
    raise exception 'sem permissão';
  end if;
  if p_semana < 1 then raise exception 'semana inválida'; end if;

  select meta_percentual into v_meta_percentual
    from public.planejamento_disciplinas
   where id = v_origem.planejamento_disciplina_id;
  v_desempenho := case
    when v_origem.questoes_feitas > 0
      then (v_origem.acertos::numeric * 100) / v_origem.questoes_feitas
    else 0
  end;
  if v_desempenho >= coalesce(v_meta_percentual, 80) then
    raise exception 'meta de origem já atingiu o percentual exigido e não precisa de reforço';
  end if;

  v_dia := coalesce(p_dia, v_origem.dia_semana);
  if v_dia not between 1 and 7 then raise exception 'dia inválido'; end if;

  select coalesce(max(ordem_dia), 0) + 1 into v_ordem
    from public.metas
   where planejamento_id = v_origem.planejamento_id
     and semana_numero = p_semana
     and dia_semana = v_dia;

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

  update public.metas set reforco_ignorado_em = null where id = v_origem.id;
  return v_reforco;
end;
$$;

create or replace function public.cancelar_reforco(p_reforco_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_aluno_id uuid;
  v_tipo public.tipo_meta;
  v_status public.status_meta;
begin
  select p.aluno_id, m.tipo, m.status
    into v_aluno_id, v_tipo, v_status
    from public.metas m
    join public.planejamentos p on p.id = m.planejamento_id
   where m.id = p_reforco_id;
  if v_tipo is null then raise exception 'reforço não encontrado'; end if;
  if v_tipo <> 'reforco' or v_status not in ('pendente', 'em_andamento') then
    raise exception 'somente reforço pendente pode ser cancelado';
  end if;
  if not (auth.uid() = v_aluno_id or public.professor_tem_aluno(v_aluno_id) or public.eh_admin()) then
    raise exception 'sem permissão';
  end if;
  delete from public.metas where id = p_reforco_id;
end;
$$;

create or replace function public.ignorar_reforco(p_meta_origem_id uuid, p_ignorar boolean default true)
returns public.metas
language plpgsql
security definer
set search_path = public
as $$
declare
  v_meta public.metas;
  v_aluno_id uuid;
begin
  select m.* into v_meta
    from public.metas m
   where m.id = p_meta_origem_id;
  if v_meta.id is null then raise exception 'meta não encontrada'; end if;
  select aluno_id into v_aluno_id
    from public.planejamentos where id = v_meta.planejamento_id;
  if auth.uid() <> v_aluno_id then raise exception 'sem permissão'; end if;
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
set search_path = public
as $$
declare
  v_aluno_id uuid;
  v_ordem integer;
  v_meta public.metas;
begin
  select aluno_id into v_aluno_id from public.planejamentos
   where id = p_planejamento_id and status = 'ativo';
  if v_aluno_id is null or v_aluno_id <> auth.uid() then raise exception 'planejamento ativo inválido'; end if;
  if p_semana < 1 or p_dia not between 1 and 7 then raise exception 'agenda inválida'; end if;
  if length(btrim(coalesce(p_atividade, ''))) < 1 then raise exception 'atividade obrigatória'; end if;
  if p_tempo_minutos not between 1 and 1440 then raise exception 'tempo inválido'; end if;

  select coalesce(max(ordem_dia), 0) + 1 into v_ordem
    from public.metas
   where planejamento_id = p_planejamento_id
     and semana_numero = p_semana
     and dia_semana = p_dia;

  insert into public.metas (
    planejamento_id, tipo, titulo, descricao, atividade_extra,
    semana_numero, dia_semana, ordem_dia, tempo_previsto_minutos,
    tempo_gasto_minutos, status, concluida_em, created_by
  ) values (
    p_planejamento_id, 'extra', 'Estudo extra - ' || btrim(p_atividade),
    nullif(btrim(p_observacao), ''), btrim(p_atividade), p_semana, p_dia,
    v_ordem, p_tempo_minutos, p_tempo_minutos, 'concluida', now(), auth.uid()
  ) returning * into v_meta;
  return v_meta;
end;
$$;

create or replace function public.substituir_metas_semana(
  p_planejamento_id uuid,
  p_semana integer,
  p_metas jsonb,
  p_replanejar_tudo boolean default false
)
returns setof public.metas
language plpgsql
security definer
set search_path = public
as $$
declare
  v_professor_id uuid;
  v_item jsonb;
  v_ordem integer;
  v_meta public.metas;
begin
  select professor_id into v_professor_id
    from public.planejamentos where id = p_planejamento_id;
  if v_professor_id is null or not (auth.uid() = v_professor_id or public.eh_admin()) then
    raise exception 'sem permissão para replanejar';
  end if;
  if p_semana < 1 then raise exception 'semana inválida'; end if;
  if jsonb_typeof(p_metas) <> 'array' or jsonb_array_length(p_metas) = 0 then
    raise exception 'lista de metas vazia ou inválida';
  end if;

  if p_replanejar_tudo then
    delete from public.metas
     where planejamento_id = p_planejamento_id and semana_numero = p_semana;
  else
    delete from public.metas
     where planejamento_id = p_planejamento_id
       and semana_numero = p_semana
       and status in ('pendente', 'em_andamento', 'pulada');
  end if;

  for v_item in select value from jsonb_array_elements(p_metas) loop
    if coalesce((v_item ->> 'semana_numero')::integer, p_semana) <> p_semana then
      raise exception 'todas as metas devem pertencer à semana informada';
    end if;

    select coalesce(max(ordem_dia), 0) + 1 into v_ordem
      from public.metas
     where planejamento_id = p_planejamento_id
       and semana_numero = p_semana
       and dia_semana = (v_item ->> 'dia_semana')::smallint;

    insert into public.metas (
      planejamento_id, planejamento_disciplina_id, planejamento_caderno_id,
      tipo, titulo, descricao, semana_numero, dia_semana, ordem_dia,
      tempo_previsto_minutos, status, created_by
    ) values (
      p_planejamento_id,
      nullif(v_item ->> 'planejamento_disciplina_id', '')::uuid,
      nullif(v_item ->> 'planejamento_caderno_id', '')::uuid,
      (v_item ->> 'tipo')::public.tipo_meta,
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

create or replace function public.concluir_revisao(p_revisao_id uuid, p_concluir boolean default true)
returns public.revisoes
language plpgsql
security definer
set search_path = public
as $$
declare
  v_revisao public.revisoes;
begin
  select * into v_revisao from public.revisoes where id = p_revisao_id;
  if v_revisao.id is null then raise exception 'revisão não encontrada'; end if;
  if v_revisao.aluno_id <> auth.uid() then raise exception 'sem permissão'; end if;

  update public.revisoes
     set status = case when p_concluir then 'concluida'::public.status_revisao else 'pendente'::public.status_revisao end,
         concluida_em = case when p_concluir then now() else null end
   where id = p_revisao_id
   returning * into v_revisao;
  return v_revisao;
end;
$$;

-- -----------------------------------------------------------------------------
-- Row Level Security
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
alter table public.progresso_aulas enable row level security;
alter table public.configuracoes_revisao enable row level security;
alter table public.revisoes enable row level security;
alter table public.lista_espera enable row level security;

create policy profiles_select on public.profiles for select to authenticated
using (id = auth.uid() or public.professor_tem_aluno(id) or public.eh_admin());

create policy vinculos_select on public.professor_alunos for select to authenticated
using (professor_id = auth.uid() or aluno_id = auth.uid() or public.eh_admin());
create policy vinculos_admin_all on public.professor_alunos for all to authenticated
using (public.eh_admin()) with check (public.eh_admin());

create policy acessos_select on public.acessos_aluno for select to authenticated
using (aluno_id = auth.uid() or public.professor_tem_aluno(aluno_id) or public.eh_admin());

create policy catalogo_cursos_select on public.cursos for select to authenticated using (true);
create policy catalogo_disciplinas_select on public.disciplinas for select to authenticated using (true);
create policy catalogo_curso_disciplinas_select on public.curso_disciplinas for select to authenticated using (true);
create policy catalogo_cadernos_select on public.cadernos_catalogo for select to authenticated using (true);
create policy catalogo_aulas_select on public.aulas_catalogo for select to authenticated using (true);
create policy catalogo_materiais_select on public.materiais_aula for select to authenticated using (true);

create policy catalogo_cursos_admin on public.cursos for all to authenticated
using (public.eh_admin()) with check (public.eh_admin());
create policy catalogo_disciplinas_admin on public.disciplinas for all to authenticated
using (public.eh_admin()) with check (public.eh_admin());
create policy catalogo_curso_disciplinas_admin on public.curso_disciplinas for all to authenticated
using (public.eh_admin()) with check (public.eh_admin());
create policy catalogo_cadernos_admin on public.cadernos_catalogo for all to authenticated
using (public.eh_admin()) with check (public.eh_admin());
create policy catalogo_aulas_admin on public.aulas_catalogo for all to authenticated
using (public.eh_admin()) with check (public.eh_admin());
create policy catalogo_materiais_admin on public.materiais_aula for all to authenticated
using (public.eh_admin()) with check (public.eh_admin());

create policy planejamentos_select on public.planejamentos for select to authenticated
using (aluno_id = auth.uid() or professor_id = auth.uid() or public.eh_admin());
create policy planejamentos_professor_insert on public.planejamentos for insert to authenticated
with check ((professor_id = auth.uid() and public.professor_tem_aluno(aluno_id)) or public.eh_admin());
create policy planejamentos_professor_update on public.planejamentos for update to authenticated
using (professor_id = auth.uid() or public.eh_admin())
with check (professor_id = auth.uid() or public.eh_admin());
create policy planejamentos_professor_delete on public.planejamentos for delete to authenticated
using (professor_id = auth.uid() or public.eh_admin());

create policy planejamento_disciplinas_select on public.planejamento_disciplinas for select to authenticated
using (public.pode_acessar_planejamento(planejamento_id));
create policy planejamento_disciplinas_professor_all on public.planejamento_disciplinas for all to authenticated
using (exists (select 1 from public.planejamentos p where p.id = planejamento_id and (p.professor_id = auth.uid() or public.eh_admin())))
with check (exists (select 1 from public.planejamentos p where p.id = planejamento_id and (p.professor_id = auth.uid() or public.eh_admin())));

create policy planejamento_cadernos_select on public.planejamento_cadernos for select to authenticated
using (exists (
  select 1 from public.planejamento_disciplinas pd
  where pd.id = planejamento_disciplina_id and public.pode_acessar_planejamento(pd.planejamento_id)
));
create policy planejamento_cadernos_professor_all on public.planejamento_cadernos for all to authenticated
using (exists (
  select 1 from public.planejamento_disciplinas pd
  join public.planejamentos p on p.id = pd.planejamento_id
  where pd.id = planejamento_disciplina_id and (p.professor_id = auth.uid() or public.eh_admin())
))
with check (exists (
  select 1 from public.planejamento_disciplinas pd
  join public.planejamentos p on p.id = pd.planejamento_id
  where pd.id = planejamento_disciplina_id and (p.professor_id = auth.uid() or public.eh_admin())
));

create policy planejamento_aulas_select on public.planejamento_aulas for select to authenticated
using (exists (
  select 1 from public.planejamento_disciplinas pd
  where pd.id = planejamento_disciplina_id and public.pode_acessar_planejamento(pd.planejamento_id)
));
create policy planejamento_aulas_professor_all on public.planejamento_aulas for all to authenticated
using (exists (
  select 1 from public.planejamento_disciplinas pd
  join public.planejamentos p on p.id = pd.planejamento_id
  where pd.id = planejamento_disciplina_id and (p.professor_id = auth.uid() or public.eh_admin())
))
with check (exists (
  select 1 from public.planejamento_disciplinas pd
  join public.planejamentos p on p.id = pd.planejamento_id
  where pd.id = planejamento_disciplina_id and (p.professor_id = auth.uid() or public.eh_admin())
));

create policy metas_select on public.metas for select to authenticated
using (public.pode_acessar_planejamento(planejamento_id));
create policy metas_professor_all on public.metas for all to authenticated
using (exists (select 1 from public.planejamentos p where p.id = planejamento_id and (p.professor_id = auth.uid() or public.eh_admin())))
with check (exists (select 1 from public.planejamentos p where p.id = planejamento_id and (p.professor_id = auth.uid() or public.eh_admin())));

create policy progresso_aulas_select on public.progresso_aulas for select to authenticated
using (aluno_id = auth.uid() or public.professor_tem_aluno(aluno_id) or public.eh_admin());
create policy progresso_aulas_aluno_all on public.progresso_aulas for all to authenticated
using (aluno_id = auth.uid()) with check (aluno_id = auth.uid());

create policy configuracoes_revisao_select on public.configuracoes_revisao for select to authenticated
using (exists (
  select 1 from public.planejamento_disciplinas pd
  where pd.id = planejamento_disciplina_id and public.pode_acessar_planejamento(pd.planejamento_id)
));
create policy configuracoes_revisao_professor_all on public.configuracoes_revisao for all to authenticated
using (exists (
  select 1 from public.planejamento_disciplinas pd
  join public.planejamentos p on p.id = pd.planejamento_id
  where pd.id = planejamento_disciplina_id and (p.professor_id = auth.uid() or public.eh_admin())
))
with check (exists (
  select 1 from public.planejamento_disciplinas pd
  join public.planejamentos p on p.id = pd.planejamento_id
  where pd.id = planejamento_disciplina_id and (p.professor_id = auth.uid() or public.eh_admin())
));

create policy revisoes_select on public.revisoes for select to authenticated
using (aluno_id = auth.uid() or public.professor_tem_aluno(aluno_id) or public.eh_admin());
create policy revisoes_professor_all on public.revisoes for all to authenticated
using (public.professor_tem_aluno(aluno_id) or public.eh_admin())
with check (public.professor_tem_aluno(aluno_id) or public.eh_admin());

create policy lista_espera_select on public.lista_espera for select to authenticated
using (aluno_id = auth.uid() or professor_id = auth.uid() or public.eh_admin());
create policy lista_espera_aluno_insert on public.lista_espera for insert to authenticated
with check (aluno_id = auth.uid());
create policy lista_espera_aluno_update on public.lista_espera for update to authenticated
using (aluno_id = auth.uid()) with check (aluno_id = auth.uid());
create policy lista_espera_professor_update on public.lista_espera for update to authenticated
using (professor_id = auth.uid() or public.eh_admin())
with check (professor_id = auth.uid() or public.eh_admin());

-- -----------------------------------------------------------------------------
-- Privilégios de API
-- -----------------------------------------------------------------------------

revoke all on all tables in schema public from anon;
grant select on public.cursos, public.disciplinas, public.curso_disciplinas,
  public.cadernos_catalogo, public.aulas_catalogo, public.materiais_aula to authenticated;
grant select on public.profiles, public.professor_alunos, public.acessos_aluno,
  public.planejamentos, public.planejamento_disciplinas, public.planejamento_cadernos,
  public.planejamento_aulas, public.metas, public.progresso_aulas,
  public.configuracoes_revisao, public.revisoes, public.lista_espera to authenticated;
grant insert, update, delete on public.professor_alunos, public.cursos, public.disciplinas,
  public.curso_disciplinas, public.cadernos_catalogo, public.aulas_catalogo,
  public.materiais_aula, public.planejamentos, public.planejamento_disciplinas,
  public.planejamento_cadernos, public.planejamento_aulas, public.metas,
  public.progresso_aulas, public.configuracoes_revisao, public.revisoes,
  public.lista_espera to authenticated;

revoke all on function public.atualizar_meu_perfil(text, text, text) from public;
revoke all on function public.liberar_acesso(uuid, integer, boolean, text) from public;
revoke all on function public.bloquear_acesso(uuid, text) from public;
revoke all on function public.renovar_acesso(uuid, integer) from public;
revoke all on function public.cancelar_acesso(uuid) from public;
revoke all on function public.concluir_meta(uuid, integer, integer, integer, text) from public;
revoke all on function public.desfazer_conclusao_meta(uuid) from public;
revoke all on function public.agendar_reforco(uuid, integer, smallint) from public;
revoke all on function public.cancelar_reforco(uuid) from public;
revoke all on function public.ignorar_reforco(uuid, boolean) from public;
revoke all on function public.registrar_estudo_extra(uuid, integer, smallint, text, integer, text) from public;
revoke all on function public.substituir_metas_semana(uuid, integer, jsonb, boolean) from public;
revoke all on function public.concluir_revisao(uuid, boolean) from public;

revoke all on function public.set_updated_at() from public;
revoke all on function public.validar_vinculo_professor_aluno() from public;
revoke all on function public.validar_planejamento() from public;
revoke all on function public.validar_meta_relacionamentos() from public;
revoke all on function public.validar_progresso_aula() from public;
revoke all on function public.validar_revisao() from public;
revoke all on function public.handle_new_auth_user() from public;

grant execute on function public.atualizar_meu_perfil(text, text, text) to authenticated;
grant execute on function public.liberar_acesso(uuid, integer, boolean, text) to authenticated;
grant execute on function public.bloquear_acesso(uuid, text) to authenticated;
grant execute on function public.renovar_acesso(uuid, integer) to authenticated;
grant execute on function public.cancelar_acesso(uuid) to authenticated;
grant execute on function public.concluir_meta(uuid, integer, integer, integer, text) to authenticated;
grant execute on function public.desfazer_conclusao_meta(uuid) to authenticated;
grant execute on function public.agendar_reforco(uuid, integer, smallint) to authenticated;
grant execute on function public.cancelar_reforco(uuid) to authenticated;
grant execute on function public.ignorar_reforco(uuid, boolean) to authenticated;
grant execute on function public.registrar_estudo_extra(uuid, integer, smallint, text, integer, text) to authenticated;
grant execute on function public.substituir_metas_semana(uuid, integer, jsonb, boolean) to authenticated;
grant execute on function public.concluir_revisao(uuid, boolean) to authenticated;

commit;