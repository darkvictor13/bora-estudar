-- Revisão espaçada — spec docs/specs/24-revisao-espacada.md
--
-- Reforço e revisão eram a mesma palavra e são coisas diferentes. O reforço já
-- existe: reação a erro, ciclo abaixo de 80%, `record_reinforcement`. A revisão
-- espaçada é o oposto — não depende de ter errado, é voltar a um caderno já
-- estudado depois de N cadernos, porque esquecer é o padrão.
--
-- Na v96 isso era `localStorage` puro nas duas telas (`renderControleRevisoes`,
-- aluno.js:3164 e professor.js:1792). Trocar de navegador perdia a grade, e
-- professor e aluno tinham cópias particulares que nunca conversavam.
--
-- A fronteira do CLAUDE.md separa as duas tabelas daqui:
--
--   review_spacings    é PLANEJAMENTO — o professor decide de quantos em
--                      quantos cadernos se revisa. Escrita direta, com RLS,
--                      `with check` e grant por coluna, como study_plan_blocks.
--
--   review_completions é EXECUÇÃO — registra o que foi feito. Só RPC, como
--                      goals.status desde a spec 12.
--
-- A GRADE não é gravada em lugar nenhum: ela é derivada das duas fórmulas da
-- v96 sobre a ordem dos blocos (R-REVE-07). Guardar a grade seria guardar um
-- agregado mantido à mão, que é exatamente o que o schema não faz.
--
-- Compatível com o bundle que já está no ar: duas tabelas novas, nenhuma
-- alterada, uma função nova que não substitui nenhuma.

-- =============================================================================
-- 1. ESPAÇAMENTO — planejamento, escrita direta
-- =============================================================================

create table if not exists public.review_spacings (
  id              uuid primary key default gen_random_uuid(),
  study_plan_id   uuid not null,
  student_id      uuid not null,
  teacher_id      uuid not null,

  -- A identidade da disciplina é o nome, porque é a identidade que o resto do
  -- produto usa: `study_plan_blocks` não tem chave de disciplina, e o site
  -- agrupa por `subject_name`. Ver R-REVE-02.
  subject_name    text not null,

  -- 0 a 60 são os limites dos campos da v96. Zero DESLIGA: primeira em zero
  -- desliga a disciplina inteira, segunda em zero desliga só a segunda coluna.
  first_interval  smallint not null default 0 check (first_interval between 0 and 60),
  second_interval smallint not null default 0 check (second_interval between 0 and 60),

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz,

  -- A cópia denormalizada do contexto nunca diverge do pai.
  constraint review_spacing_context_fk
    foreign key (study_plan_id, student_id, teacher_id)
    references public.study_plans (id, student_id, teacher_id) on delete cascade
);

comment on table public.review_spacings is
  'De quantos em quantos cadernos a disciplina é revisada. Planejamento: quem escreve é o professor.';

-- Uma linha por disciplina no planejamento. Parcial porque excluir é deleted_at.
create unique index if not exists review_spacing_subject_uidx
  on public.review_spacings (study_plan_id, subject_name)
  where deleted_at is null;

create index if not exists review_spacing_plan_idx
  on public.review_spacings (study_plan_id)
  where deleted_at is null;

-- =============================================================================
-- 2. MARCAÇÃO — execução, só RPC
-- =============================================================================

create table if not exists public.review_completions (
  id                   uuid primary key default gen_random_uuid(),
  study_plan_id        uuid not null,
  student_id           uuid not null,
  -- O professor vai denormalizado porque `can_view_context` COMPARA ids, não
  -- consulta vínculo: sem esta coluna a grade some para o professor.
  teacher_id           uuid not null,
  study_plan_block_id  uuid not null,

  -- 1 ou 2: a v96 tem duas revisões e o produto não pede a terceira.
  ordinal              smallint not null check (ordinal in (1, 2)),

  -- Quem marcou. O professor também marca, em atendimento (R-REVE-15).
  completed_by         uuid not null references public.profiles(id) on delete restrict,
  completed_at         timestamptz not null default now(),

  created_at           timestamptz not null default now(),
  deleted_at           timestamptz,

  constraint review_completion_block_fk
    foreign key (study_plan_block_id, study_plan_id, student_id)
    references public.study_plan_blocks (id, study_plan_id, student_id) on delete restrict,
  -- A cópia denormalizada do contexto nunca diverge do pai.
  constraint review_completion_context_fk
    foreign key (study_plan_id, student_id, teacher_id)
    references public.study_plans (id, student_id, teacher_id) on delete cascade
);

comment on table public.review_completions is
  'Revisão feita, por (bloco, ordinal). A chave é o BLOCO revisado, nunca a linha da grade: mudar o espaçamento não pode orfanar o que o aluno já fez.';

-- A chave é o bloco revisado, não a linha da grade. Na v96 a chave era
-- `disciplina:linha:tipo:aula`, e mudar o espaçamento órfãava tudo — "fiz a
-- primeira revisão da Aula 3" é verdade independentemente de quando ela foi
-- agendada. Ver R-REVE-11.
create unique index if not exists review_completion_uidx
  on public.review_completions (study_plan_block_id, ordinal)
  where deleted_at is null;

create index if not exists review_completion_plan_idx
  on public.review_completions (study_plan_id)
  where deleted_at is null;

-- =============================================================================
-- 3. RLS
-- =============================================================================

alter table public.review_spacings    enable row level security;
alter table public.review_completions enable row level security;

-- Leitura: o dono do contexto. `can_view_context` é o mesmo predicado que
-- goals e quiz_sessions usam — aluno vê o seu, professor vê o do aluno com
-- vínculo vigente.
drop policy if exists review_spacings_read on public.review_spacings;
create policy review_spacings_read on public.review_spacings for select to authenticated
  using (public.can_view_context(student_id, teacher_id));

drop policy if exists review_completions_read on public.review_completions;
create policy review_completions_read on public.review_completions for select to authenticated
  using (public.can_view_context(student_id, teacher_id));

-- Escrita do espaçamento: só o professor, e só de aluno com vínculo vigente.
-- O `with check` amarra a linha ao professor autenticado E ao aluno dele: é a
-- primeira das três defesas do CLAUDE.md.
drop policy if exists review_spacings_teacher_insert on public.review_spacings;
create policy review_spacings_teacher_insert on public.review_spacings for insert to authenticated
  with check (teacher_id = auth.uid() and public.is_teacher_of(student_id));

drop policy if exists review_spacings_teacher_update on public.review_spacings;
create policy review_spacings_teacher_update on public.review_spacings for update to authenticated
  using (teacher_id = auth.uid())
  with check (teacher_id = auth.uid() and public.is_teacher_of(student_id));

-- `review_completions` não ganha policy de escrita: quem escreve é a RPC, que
-- roda como `security definer`.

-- =============================================================================
-- 4. GRANTS
-- =============================================================================

grant select on public.review_spacings    to authenticated;
grant select on public.review_completions to authenticated;

grant insert on public.review_spacings to authenticated;

-- As colunas de contexto — study_plan_id, student_id, teacher_id, subject_name —
-- ficam FORA do grant. A RLS sozinha deixaria mover a linha entre dois alunos
-- do mesmo professor; o grant por coluna não deixa. Segunda defesa do
-- CLAUDE.md, e R-REVE-06.
grant update (first_interval, second_interval, updated_at, deleted_at)
  on public.review_spacings to authenticated;

-- DELETE não é concedido em lugar nenhum. Remover é UPDATE em deleted_at.

-- =============================================================================
-- 5. GATILHOS
-- =============================================================================

-- `updated_at` só faz sentido onde há UPDATE de conteúdo: review_completions é
-- levada a um estado pela RPC e não tem a coluna.
drop trigger if exists tg_review_spacings_atualizado_em on public.review_spacings;
create trigger tg_review_spacings_atualizado_em before update on public.review_spacings
  for each row execute function public.tg_set_updated_at();

-- As duas entram na auditoria: o espaçamento porque é decisão do professor
-- sobre o estudo do aluno, e a marcação porque "marquei, desmarquei, marquei" é
-- exatamente o que o audit_log responde.
do $$
declare
  t text;
begin
  foreach t in array array['review_spacings','review_completions'] loop
    execute format(
      'drop trigger if exists tg_%1$s_auditoria on public.%1$s;
       create trigger tg_%1$s_auditoria after insert or update or delete on public.%1$s
         for each row execute function public.tg_write_audit_log();', t);
  end loop;
end;
$$;

-- =============================================================================
-- 6. RPC
-- =============================================================================

-- Marca ou desmarca uma revisão.
--
-- IDEMPOTENTE POR NATUREZA, e por isso não recebe `request_id` nem passa por
-- `reserve_operation` — a justificativa que o CLAUDE.md exige por escrito:
-- a função leva o par (bloco, ordinal) a um ESTADO, marcado ou desmarcado, e
-- não acumula nada. Chamá-la duas vezes com o mesmo argumento produz o mesmo
-- estado, e não há payload cujo hash comparar. Ver R-REVE-13.
--
-- Aluno e professor marcam: na v96 as duas telas tinham a caixa, e é o
-- professor quem conduz a revisão em atendimento (R-REVE-15).
create or replace function public.set_review_done(
  p_study_plan_id uuid,
  p_block_id      uuid,
  p_ordinal       smallint,
  p_done          boolean
) returns public.review_completions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_block  public.study_plan_blocks%rowtype;
  v_row    public.review_completions%rowtype;
  v_caller uuid := auth.uid();
begin
  if v_caller is null then
    raise exception 'nao autenticado' using errcode = '42501';
  end if;

  if p_ordinal is null or p_ordinal not in (1, 2) then
    raise exception 'ordinal de revisao invalido' using errcode = '22023';
  end if;

  -- O bloco precisa existir, pertencer ao planejamento informado e não estar
  -- excluído. Revisar o que saiu do planejamento é trabalho jogado fora, e
  -- aceitar aqui deixaria a marcação órfã de qualquer grade (R-REVE-16).
  select * into v_block
    from public.study_plan_blocks
   where id = p_block_id
     and study_plan_id = p_study_plan_id
     and deleted_at is null;

  if not found then
    raise exception 'bloco nao encontrado no planejamento' using errcode = 'P0002';
  end if;

  -- Aluno dono, ou professor com vínculo vigente. Qualquer outro é 42501.
  if v_caller <> v_block.student_id and not public.is_teacher_of(v_block.student_id) then
    raise exception 'sem permissao para marcar revisao deste aluno' using errcode = '42501';
  end if;

  if p_done then
    -- Remarcar limpa o `deleted_at` da linha que já existe, em vez de criar uma
    -- segunda: o índice parcial só admite uma viva por (bloco, ordinal).
    update public.review_completions
       set deleted_at = null,
           completed_by = v_caller,
           completed_at = now()
     where study_plan_block_id = p_block_id
       and ordinal = p_ordinal
    returning * into v_row;

    if not found then
      insert into public.review_completions (
        study_plan_id, student_id, teacher_id, study_plan_block_id, ordinal, completed_by
      ) values (
        p_study_plan_id, v_block.student_id, v_block.teacher_id, p_block_id, p_ordinal, v_caller
      )
      returning * into v_row;
    end if;
  else
    -- Desmarcar NÃO apaga: escreve deleted_at. Nada é apagado fisicamente neste
    -- schema, e "marquei, desmarquei, marquei" é o que o audit_log responde.
    update public.review_completions
       set deleted_at = now()
     where study_plan_block_id = p_block_id
       and ordinal = p_ordinal
       and deleted_at is null
    returning * into v_row;

    -- Desmarcar o que não estava marcado é no-op, não erro: é o que "levar a um
    -- estado" significa.
    if not found then
      select * into v_row
        from public.review_completions
       where study_plan_block_id = p_block_id and ordinal = p_ordinal;
    end if;
  end if;

  -- A auditoria NÃO é escrita aqui: quem escreve é `tg_write_audit_log`, o
  -- mesmo gatilho de study_plans, goals, quiz_sessions e subscriptions. Um
  -- insert manual seria um segundo formato de linha na mesma tabela, e o
  -- audit_log tem colunas fixas — table_name, record_id, action, old_value,
  -- new_value —, não um payload livre.
  return v_row;
end;
$$;

comment on function public.set_review_done(uuid, uuid, smallint, boolean) is
  'Marca ou desmarca a Nª revisão de um bloco. Idempotente por natureza: leva o par (bloco, ordinal) a um estado. Aluno dono ou professor com vínculo.';

-- O default do Postgres concede EXECUTE a PUBLIC, que não é anon nem
-- authenticated: revogar dos dois papéis não tiraria nada. Foi assim que
-- reserve_operation ficou chamável por qualquer autenticado — BUG-14.
revoke execute on function public.set_review_done(uuid, uuid, smallint, boolean) from public;
grant execute on function public.set_review_done(uuid, uuid, smallint, boolean) to authenticated;
