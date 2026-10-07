-- =============================================================================
-- Um planejamento ativo por aluno (QA-03, QA-12)
-- =============================================================================
-- O índice que o CLAUDE.md, as specs 03 e 14 e `teacher-plans.ts` davam como
-- existente, e a RPC que troca o ativo numa transação.
--
-- O QUE ESTA MIGRATION FAZ COM OS DADOS: por aluno com mais de um planejamento
-- `active`, fica ativo o de `updated_at` mais recente (desempate por
-- `created_at` e `id`); os outros viram `paused` (D-03 do plano do QA —
-- reversível, porque a limpeza não sabe qual o professor quis). No banco local
-- de 06/10/2026 eram 6 alunos. A contagem sai no log do deploy.
-- =============================================================================

do $$
declare v_paused integer;
begin
  with ranked as (
    select id,
           row_number() over (
             partition by student_id
             order by updated_at desc, created_at desc, id desc
           ) as position
      from public.study_plans
     where status = 'active'
  )
  update public.study_plans p
     set status = 'paused'
    from ranked r
   where r.id = p.id
     and r.position > 1;
  get diagnostics v_paused = row_count;
  raise notice 'study_plans: % planejamento(s) ativo(s) a mais passaram a paused', v_paused;
end $$;

-- Nasce validado: a limpeza acima deixou no máximo um ativo por aluno.
create unique index study_plans_one_active_per_student_uidx
  on public.study_plans (student_id)
  where status = 'active';

-- Ativa um planejamento e arquiva o ativo anterior do mesmo aluno, numa
-- transação.
--
-- NATURALMENTE IDEMPOTENTE, sem `request_id`: o parâmetro é a identidade do
-- alvo e o efeito é um estado. Ativar o que já está ativo devolve a linha sem
-- escrever. Quem sustenta: `study_plans_one_active_per_student_uidx` (o estado
-- final nunca tem dois ativos) e a trava abaixo (a segunda chamada enxerga a
-- primeira em vez de bater no índice).
create or replace function public.activate_study_plan(p_study_plan_id uuid)
returns public.study_plans
language plpgsql security definer set search_path = '' as $$
declare
  v_uid  uuid := (select auth.uid());
  v_plan public.study_plans;
begin
  if v_uid is null then
    raise exception 'Usuário não autenticado.' using errcode = '42501';
  end if;

  select * into v_plan from public.study_plans p where p.id = p_study_plan_id;
  -- Inexistente e alheio dão o MESMO erro: distinguir diria a quem pergunta
  -- que o id existe. `is_teacher_of` confere o vínculo pelo ALUNO, como o
  -- WITH CHECK de `study_plans_update`.
  if not found
     or v_plan.teacher_id <> v_uid
     or not public.is_teacher()
     or not public.is_teacher_of(v_plan.student_id) then
    raise exception 'Planejamento não encontrado, ou não é seu.' using errcode = '42501';
  end if;

  -- SERIALIZA as ativações do MESMO ALUNO: trava todos os planejamentos dele,
  -- sempre na ordem do id (duas chamadas nunca se esperam em ciclo). Travar só
  -- o alvo não basta: duas abas ativando planos DIFERENTES não disputam a mesma
  -- linha, e a segunda bateria no índice.
  --
  -- `no key update`, e não `update`: o `status` não é chave, e `for update`
  -- bloquearia o `for key share` que a FK pega quando o aluno lança estudo
  -- extra (`goals.study_plan_id`). É o mesmo modo de `generate_week`, que trava
  -- só a linha do plano e por isso não forma ciclo com esta.
  perform 1
     from public.study_plans p
    where p.student_id = v_plan.student_id
    order by p.id
      for no key update;

  -- Releitura DEPOIS da trava: quem esperou decide pelo que a outra transação
  -- gravou, e não pelo que leu antes de esperar.
  select * into v_plan from public.study_plans p where p.id = p_study_plan_id;
  if v_plan.status = 'active' then
    return v_plan;
  end if;

  update public.study_plans p
     set status = 'archived'
   where p.student_id = v_plan.student_id
     and p.status = 'active'
     and p.id <> p_study_plan_id;

  update public.study_plans p
     set status = 'active'
   where p.id = p_study_plan_id
  returning * into v_plan;

  return v_plan;
end;
$$;

comment on function public.activate_study_plan(uuid) is
  'Ativa um planejamento e arquiva o ativo anterior do mesmo aluno, numa transação. Naturalmente idempotente: quem sustenta é study_plans_one_active_per_student_uidx, com a trava dos planejamentos do aluno.';

revoke all on function public.activate_study_plan(uuid) from public, anon, authenticated;
grant execute on function public.activate_study_plan(uuid) to authenticated;
