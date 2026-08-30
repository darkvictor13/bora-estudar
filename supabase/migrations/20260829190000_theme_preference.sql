-- Tema claro e escuro — spec docs/specs/11-tema-claro-escuro.md
--
-- A preferência é da CONTA, não do aluno: `user_preferences` é chaveada por
-- `profile_id` e vale para os três valores de `user_role`. `student_preferences`
-- continua existindo para o que é de estudo (`cycle_config`, `review_config`) e
-- perde a coluna `theme`, que era `text not null default 'claro'` — dado de
-- domínio em texto livre, com valor em português, que nenhuma tela jamais leu.
--
-- Compatível com o bundle que já está no ar: a tabela é nova, e o `drop column`
-- remove uma coluna que nenhum arquivo do site ou da extensão referencia.

-- =============================================================================
-- 1. TIPO
-- =============================================================================
-- Dois valores, em inglês, como todo enum do schema. Não existe um terceiro
-- valor "seguir o sistema": `prefers-color-scheme` não é lido em lugar nenhum
-- (R-TEMA-06).

do $$
begin
  if not exists (select 1 from pg_type where typname = 'theme_preference') then
    create type public.theme_preference as enum ('light','dark');
  end if;
end;
$$;

-- =============================================================================
-- 2. TABELA
-- =============================================================================
-- Sem linha para quem nunca escolheu: a ausência equivale a `light` (R-TEMA-07).
-- Por isso nenhum gatilho a cria junto do perfil.

create table if not exists public.user_preferences (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  theme      public.theme_preference not null default 'light',
  updated_at timestamptz not null default now()
);

comment on table public.user_preferences is
  'Preferência de interface da conta, para qualquer papel. Ausência de linha equivale ao default.';

alter table public.user_preferences enable row level security;

drop policy if exists user_preferences_own on public.user_preferences;
create policy user_preferences_own on public.user_preferences for all to authenticated
  using (profile_id = auth.uid()) with check (profile_id = auth.uid());

-- Grant por coluna: `profile_id` fica FORA do UPDATE. A RLS sozinha recusaria
-- mover a linha para outro perfil pelo `with check`, mas o grant por coluna
-- recusa antes, e é a defesa que o CLAUDE.md exige em toda tabela nova.
-- `delete` não é concedido, aqui como em nenhuma tabela do schema.
grant select, insert on public.user_preferences to authenticated;
grant update (theme) on public.user_preferences to authenticated;

-- Mesmo gatilho das demais tabelas. Ele já declara `set search_path = ''` desde
-- 20260829183000_harden_function_grants.sql.
drop trigger if exists tg_user_preferences_atualizado_em on public.user_preferences;
create trigger tg_user_preferences_atualizado_em before update on public.user_preferences
  for each row execute function public.tg_set_updated_at();

-- `user_preferences` não entra no audit_log: troca de tema não é evento de
-- estudo, e um log que registra tudo deixa de ser lido (R-TEMA-09).

-- =============================================================================
-- 3. student_preferences PERDE theme
-- =============================================================================

alter table public.student_preferences drop column if exists theme;
