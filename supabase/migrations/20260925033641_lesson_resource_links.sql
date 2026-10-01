-- Materiais de apoio pertencem à aula do catálogo. O desempenho permanece
-- exclusivamente nos registros de questões (goal_entries).
alter table public.theory_lessons
  add column published boolean not null default false,
  add column pdf_url text,
  add column flashcards_url text,
  add column flash_summary_url text,
  add column tec_questions_url text,
  add column qc_questions_url text,
  add column material_blocks jsonb not null default '[]'::jsonb;

-- Preserva o acesso às aulas que já estavam ativas; novas aulas começam em rascunho.
update public.theory_lessons set published = true where active = true;

alter table public.theory_lessons
  add constraint theory_lessons_material_blocks_array_check check (
    jsonb_typeof(material_blocks) = 'array' and jsonb_array_length(material_blocks) <= 30
  ),
  add constraint theory_lessons_resource_urls_https_check check (
    (pdf_url is null or pdf_url ~* '^https://[^[:space:]]+$') and
    (flashcards_url is null or flashcards_url ~* '^https://[^[:space:]]+$') and
    (flash_summary_url is null or flash_summary_url ~* '^https://[^[:space:]]+$') and
    (tec_questions_url is null or tec_questions_url ~* '^https://[^[:space:]]+$') and
    (qc_questions_url is null or qc_questions_url ~* '^https://[^[:space:]]+$')
  ),
  add constraint theory_lessons_no_session_tokens_check check (
    coalesce(pdf_url, '') !~* '([?&](api_key|access_token|token|signature|sig)=)' and
    coalesce(flashcards_url, '') !~* '([?&](api_key|access_token|token|signature|sig)=)' and
    coalesce(flash_summary_url, '') !~* '([?&](api_key|access_token|token|signature|sig)=)' and
    coalesce(tec_questions_url, '') !~* '([?&](api_key|access_token|token|signature|sig)=)' and
    coalesce(qc_questions_url, '') !~* '([?&](api_key|access_token|token|signature|sig)=)'
  );

-- O professor pode preparar aulas sem mostrá-las. O aluno só lê as publicadas.
drop policy theory_lessons_select on public.theory_lessons;
create policy theory_lessons_select on public.theory_lessons for select to authenticated
  using (
    teacher_id = (select auth.uid())
    or (published and public.can_access_teacher(teacher_id))
  );
