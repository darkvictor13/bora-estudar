-- A turma compartilha um catálogo; o progresso continua no planejamento do aluno.
alter table public.classes
  add column theory_catalog_id uuid;

-- O catálogo escolhido deve pertencer ao mesmo professor da turma.
alter table public.classes
  add constraint classes_theory_catalog_fk
  foreign key (theory_catalog_id, teacher_id)
  references public.theory_catalogs (id, teacher_id)
  on delete set null (theory_catalog_id);

create index classes_theory_catalog_id_idx
  on public.classes (theory_catalog_id)
  where theory_catalog_id is not null;

-- O professor já pode atualizar a própria turma pela RLS existente.
grant update (theory_catalog_id) on public.classes to authenticated;
