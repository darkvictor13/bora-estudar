-- Dificuldades por tópico — spec docs/specs/23-dificuldades-por-topico.md
--
-- O professor via "desempenho oficial 73%" e não sabia em quê o aluno estava
-- errando. O dado já existia — `quiz_session_questions.topic` guarda o tópico da
-- ocorrência —, faltava a agregação.
--
-- Aditiva: nenhuma consulta existente muda, e o bundle que está no ar não
-- conhece esta view.

-- `security_invoker` garante que a RLS das tabelas base seja aplicada a quem
-- consulta. Sem isso a view rodaria com privilégio do dono e vazaria dados
-- entre alunos — vale para toda view deste schema.
--
-- Só `completed` e só `main`: é o mesmo recorte de `record_reinforcement` e o
-- mesmo da v96. O diagnóstico olha a nota oficial, não o treino extra.
create or replace view public.vw_topic_difficulty
with (security_invoker = true) as
select
  s.student_id,
  s.study_plan_id,
  s.block_id,
  -- Questão sem tópico não some: sumir esconderia erro real por falha de
  -- cadastro. Ela é agrupada sob um rótulo próprio.
  coalesce(nullif(btrim(q.topic), ''), 'Tópico não identificado') as topic,

  count(*)                                                        as answered,
  count(*) filter (where q.outcome = 'correct')                   as correct,
  count(*) filter (where q.outcome = 'incorrect')                 as incorrect,

  -- Distingue "errei três vezes a mesma questão" de "erro espalhado".
  count(distinct q.question_id) filter (where q.outcome = 'incorrect')
                                                                  as distinct_wrong,
  -- É esta coluna que decide o rótulo "recorrente": erro em 2+ baterias
  -- distintas é não saber a matéria; numa só, pode ser o enunciado. A view
  -- guarda o NÚMERO; quem rotula é a tela.
  count(distinct q.quiz_session_id) filter (where q.outcome = 'incorrect')
                                                                  as sessions_with_error,

  case when count(*) > 0
       then round(100.0 * count(*) filter (where q.outcome = 'correct') / count(*))::smallint
  end                                                             as score_pct
from public.quiz_session_questions q
join public.quiz_sessions s on s.id = q.quiz_session_id
where s.status = 'completed'
  and q.phase = 'main'
group by s.student_id, s.study_plan_id, s.block_id,
         coalesce(nullif(btrim(q.topic), ''), 'Tópico não identificado');

comment on view public.vw_topic_difficulty is
  'Desempenho por tópico, somente principais de baterias concluídas. sessions_with_error >= 2 é o critério de "recorrente".';

grant select on public.vw_topic_difficulty to authenticated;
