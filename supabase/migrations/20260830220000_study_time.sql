-- Tempo de estudo, série semanal e sequência de dias — spec 25
-- docs/specs/25-tempo-de-estudo-e-series.md
--
-- O tempo é registrado desde a migration inicial e nunca foi lido. Três telas
-- faltavam, e as três partem da mesma linha: uma meta concluída, com quando,
-- quanto tempo e em quê.
--
-- Por que uma view e não uma consulta do site: a regra de QUAL minuto conta —
-- `coalesce(sum(duration_minutes), spent_minutes)` — já mora em
-- `vw_goal_performance`. Reimplementá-la no cliente criaria o segundo caminho
-- independente para o mesmo número, que é exatamente o defeito que este schema
-- foi desenhado para não repetir. Ver R-TEMP-02.
--
-- Aditiva: view nova, nenhuma tabela alterada, nenhuma função substituída. O
-- bundle que está no ar não a conhece e continua funcionando.

create or replace view public.vw_study_time
with (security_invoker = true) as
select
  g.id             as goal_id,
  g.student_id,
  g.teacher_id,
  g.study_plan_id,
  g.week_number,
  g.type           as goal_type,
  g.extra_activity,
  g.block_id,
  pb.subject_name,
  -- A data é LOCAL, não UTC. Um estudo concluído às 22h de sexta em
  -- America/Sao_Paulo é 01h de sábado em UTC: contar em UTC jogaria o dia para
  -- a frente e a sequência de dias quebraria sozinha. Ver R-TEMP-03.
  (g.completed_at at time zone 'America/Sao_Paulo')::date as completed_on,
  -- Mesma regra de vw_goal_performance: a bateria manda, e a meta sem bateria
  -- usa o que o aluno declarou. Nulo quando ele concluiu sem informar tempo —
  -- e nulo é "não registrou", que não é zero (R-TEMP-09).
  coalesce(sum(s.duration_minutes), g.spent_minutes) as minutes_spent,
  coalesce(sum(d.main_count), 0)   as questions_answered,
  coalesce(sum(d.main_correct), 0) as correct_answers
from public.goals g
left join public.study_plan_blocks pb
       on pb.id = g.block_id
left join public.quiz_sessions s
       on s.goal_id = g.id and s.status = 'completed'
left join public.vw_quiz_session_performance d
       on d.quiz_session_id = s.id
where g.deleted_at is null
  and g.status = 'completed'
  and g.completed_at is not null
group by g.id, pb.subject_name;

comment on view public.vw_study_time is
  'Uma linha por meta concluída: quando (data local), quanto tempo, em que disciplina ou atividade. Fonte única das três leituras da spec 25.';

grant select on public.vw_study_time to authenticated;
