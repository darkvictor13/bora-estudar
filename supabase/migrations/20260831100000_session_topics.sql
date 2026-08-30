-- Resumo por tópicos da bateria — spec 26
-- docs/specs/26-topicos-do-bloco-e-da-bateria.md
--
-- A bateria termina e o aluno vê "11/15". A v96 mostrava "TÓPICOS ESTUDADOS",
-- com acertos e erros por tópico DAQUELA bateria (`resumoBateriaDb`,
-- aluno.js:4444) — e para isso baixava 1,97 MB de catálogo. Aqui o tópico já
-- está no ledger desde a spec 21, e a agregação é uma view.
--
-- É um nível abaixo de `vw_quiz_session_performance`: mesma forma, com o tópico
-- no group by. E é um recorte diferente de `vw_topic_difficulty`, que agrega o
-- planejamento inteiro — ali o número é nota acumulada, aqui é diagnóstico de
-- uma sessão.
--
-- AS TRÊS FASES ENTRAM, e separadas. A spec 23 olha só `main` porque nota é das
-- principais; aqui o aluno quer justamente saber que errou a correlata do mesmo
-- assunto. Ver R-RESU-07.
--
-- Aditiva: view nova, nada alterado.

create or replace view public.vw_session_topics
with (security_invoker = true) as
select
  s.id          as quiz_session_id,
  s.student_id,
  s.teacher_id,
  s.study_plan_id,
  s.block_id,
  coalesce(nullif(btrim(q.topic), ''), 'Tópico não identificado') as topic,

  count(*)                                                                     as answered,
  count(*) filter (where q.outcome = 'correct')                                as correct,
  count(*) filter (where q.outcome = 'incorrect')                              as incorrect,

  count(*) filter (where q.phase = 'main')                                     as main_count,
  count(*) filter (where q.phase = 'main'          and q.outcome = 'correct')  as main_correct,

  count(*) filter (where q.phase = 'reinforcement')                            as reinforcement_count,
  count(*) filter (where q.phase = 'reinforcement' and q.outcome = 'correct')  as reinforcement_correct,

  count(*) filter (where q.phase = 'extra')                                    as extra_count,
  count(*) filter (where q.phase = 'extra'         and q.outcome = 'correct')  as extra_correct
from public.quiz_session_questions q
join public.quiz_sessions s on s.id = q.quiz_session_id
-- Só concluída: em andamento não tem resumo, e anulada saiu do desempenho —
-- mostrá-la contradiria a tela que a anulou (R-RESU-08).
where s.status = 'completed'
group by s.id, coalesce(nullif(btrim(q.topic), ''), 'Tópico não identificado');

comment on view public.vw_session_topics is
  'Uma linha por (bateria concluída, tópico), com as três fases separadas. Recorte de UMA bateria; o acumulado do planejamento é vw_topic_difficulty.';

grant select on public.vw_session_topics to authenticated;
