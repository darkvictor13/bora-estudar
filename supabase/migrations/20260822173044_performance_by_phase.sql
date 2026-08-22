-- =============================================================================
-- Desempenho separado por fase da questão
-- =============================================================================
-- Requisito trazido pelas versões v92 e v93 do produto legado:
--
--   - "Desempenho oficial": acertos sobre questões PRINCIPAIS. Continua sendo
--     a nota da meta e o critério de ordenação dos blocos.
--   - "Aproveitamento total": acertos sobre principais + extras + reforços.
--   - A tabela de blocos mostra a composição (P, E, R) com acertos e erros
--     de cada origem.
--   - O caderno de erros reúne erros das TRÊS origens, cada um rotulado com a
--     fase em que ocorreu.
--
-- O ledger já guarda tudo isso desde a migration inicial: `phase` e `outcome`
-- em quiz_session_questions. Faltavam apenas as views que expõem o recorte.
-- Nenhuma tabela muda.
--
-- Regra deliberadamente PRESERVADA: o reforço automático a cada três sessões
-- continua avaliando somente as principais. Ver record_reinforcement, que
-- soma main_count/main_correct e exige revisão apenas dos erros de phase='main'.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Desempenho por sessão, com as três fases completas
-- -----------------------------------------------------------------------------
-- `create or replace view` só acrescenta coluna no fim: inserir no meio é lido
-- como renomear a que estava naquela posição. Como as três fases precisam ficar
-- agrupadas para o SQL continuar legível, as views são derrubadas e recriadas.
-- A ordem respeita as dependências; nenhuma tabela é tocada.
drop view if exists public.vw_block_performance;
drop view if exists public.vw_goal_performance;
drop view if exists public.vw_quiz_session_performance;

create view public.vw_quiz_session_performance
with (security_invoker = true) as
select
  s.id               as quiz_session_id,
  s.student_id,
  s.teacher_id,
  s.study_plan_id,
  s.block_id,
  s.goal_id,
  s.status,
  s.main_target,
  s.duration_minutes,

  count(*) filter (where q.phase = 'main')                                     as main_count,
  count(*) filter (where q.phase = 'main'          and q.outcome = 'correct')   as main_correct,
  count(*) filter (where q.phase = 'main'          and q.outcome = 'incorrect') as main_incorrect,

  count(*) filter (where q.phase = 'reinforcement')                            as reinforcement_count,
  count(*) filter (where q.phase = 'reinforcement' and q.outcome = 'correct')   as reinforcement_correct,
  count(*) filter (where q.phase = 'reinforcement' and q.outcome = 'incorrect') as reinforcement_incorrect,

  count(*) filter (where q.phase = 'extra')                                    as extra_count,
  count(*) filter (where q.phase = 'extra'         and q.outcome = 'correct')   as extra_correct,
  count(*) filter (where q.phase = 'extra'         and q.outcome = 'incorrect') as extra_incorrect,

  count(q.id)                                                                  as total_count,
  count(*) filter (where q.outcome = 'correct')                                as total_correct,
  count(*) filter (where q.outcome = 'incorrect')                              as total_incorrect
from public.quiz_sessions s
left join public.quiz_session_questions q on q.quiz_session_id = s.id
group by s.id;

comment on view public.vw_quiz_session_performance is
  'Desempenho de uma sessão, por fase. main_* é a nota oficial; total_* inclui extras e reforços.';


-- -----------------------------------------------------------------------------
-- Desempenho por meta — inalterada, recriada por ter sido derrubada acima
-- -----------------------------------------------------------------------------
-- A nota da meta continua sendo só das principais. É a regra que o v93
-- preserva explicitamente ao introduzir o "aproveitamento total".
create view public.vw_goal_performance
with (security_invoker = true) as
select
  g.id            as goal_id,
  g.student_id,
  g.teacher_id,
  g.study_plan_id,
  g.status,
  coalesce(sum(d.main_count), 0)   as questions_answered,
  coalesce(sum(d.main_correct), 0) as correct_answers,
  sum(s.duration_minutes)          as minutes_spent
from public.goals g
left join public.quiz_sessions s
       on s.goal_id = g.id and s.status = 'completed'
left join public.vw_quiz_session_performance d
       on d.quiz_session_id = s.id
where g.deleted_at is null
group by g.id;


-- -----------------------------------------------------------------------------
-- Desempenho por bloco — alimenta a tabela "Blocos x desempenho"
-- -----------------------------------------------------------------------------
create view public.vw_block_performance
with (security_invoker = true) as
select
  d.student_id,
  d.study_plan_id,
  d.block_id,
  count(*)                        as session_count,

  sum(d.main_count)               as main_count,
  sum(d.main_correct)             as main_correct,
  sum(d.main_incorrect)           as main_incorrect,

  sum(d.extra_count)              as extra_count,
  sum(d.extra_correct)            as extra_correct,
  sum(d.extra_incorrect)          as extra_incorrect,

  sum(d.reinforcement_count)      as reinforcement_count,
  sum(d.reinforcement_correct)    as reinforcement_correct,
  sum(d.reinforcement_incorrect)  as reinforcement_incorrect,

  sum(d.total_count)              as total_count,
  sum(d.total_correct)            as total_correct,
  sum(d.total_incorrect)          as total_incorrect,

  -- Nota oficial: só principais. É por ela que os blocos são ordenados.
  case when sum(d.main_count) > 0
       then round(100.0 * sum(d.main_correct) / sum(d.main_count))::smallint
  end                             as official_score_pct,

  -- Aproveitamento total: tudo que o aluno resolveu no bloco.
  case when sum(d.total_count) > 0
       then round(100.0 * sum(d.total_correct) / sum(d.total_count))::smallint
  end                             as total_score_pct
from public.vw_quiz_session_performance d
where d.status = 'completed'
group by d.student_id, d.study_plan_id, d.block_id;

comment on view public.vw_block_performance is
  'Composição e desempenho de um bloco. official_score_pct usa só principais; total_score_pct inclui extras e reforços.';


-- -----------------------------------------------------------------------------
-- Caderno de erros — erros das três fases, rotulados
-- -----------------------------------------------------------------------------
-- Uma linha por questão distinta errada no bloco, com a última ocorrência e a
-- contagem por fase. Agregado de propósito: a versão anterior trazia o ledger
-- inteiro para o navegador e agregava em JavaScript, o que estourava o teto de
-- linhas do PostgREST e truncava em silêncio.
create or replace view public.vw_block_errors
with (security_invoker = true) as
select
  s.student_id,
  s.study_plan_id,
  s.block_id,
  q.question_id,
  max(q.topic)                                                as topic,
  count(*)                                                    as error_count,
  count(*) filter (where q.phase = 'main')                    as main_errors,
  count(*) filter (where q.phase = 'extra')                   as extra_errors,
  count(*) filter (where q.phase = 'reinforcement')           as reinforcement_errors,
  max(q.answered_at)                                          as last_error_at,
  -- Fase da ocorrência mais recente, para a UI rotular a questão.
  (array_agg(q.phase order by q.answered_at desc))[1]         as last_error_phase
from public.quiz_session_questions q
join public.quiz_sessions s on s.id = q.quiz_session_id
where s.status = 'completed'
  and q.outcome = 'incorrect'
group by s.student_id, s.study_plan_id, s.block_id, q.question_id;

comment on view public.vw_block_errors is
  'Questões erradas por bloco, somando as três fases. Uma linha por questão distinta.';


grant select on
  public.vw_quiz_session_performance,
  public.vw_goal_performance,
  public.vw_block_performance,
  public.vw_block_errors
to authenticated;
