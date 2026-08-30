-- Vínculo do aluno e liberação de acesso — spec docs/specs/13-vinculo-e-liberacao-de-acesso.md
--
-- Quem se cadastrava ficava na lista de espera para sempre: não nascia vínculo
-- nem assinatura, e não havia caminho para um professor mudar isso.
--
-- O problema não era só falta de tela. `profiles_read` e `waitlist_own` passam
-- por `is_teacher_of`, que exige vínculo vigente — o professor só enxerga quem
-- JÁ é aluno dele. Sem uma leitura nova, qualquer tela de "vincular" mostraria
-- lista vazia. É o único item da fila do inventário que exige policy nova.
--
-- Compatível com o bundle que já está no ar: nenhuma coluna muda, nenhuma RPC é
-- substituída, e a policy nova é aditiva e só de leitura.

-- =============================================================================
-- 1. PREDICADO
-- =============================================================================
-- `security definer` pelo mesmo motivo de `is_teacher_of` e `can_view_context`:
-- referenciar `student_teacher_links` direto na expressão de uma policy faria a
-- RLS daquela tabela ser aplicada ali dentro, com risco de recursão entre
-- policies (R-VINC-03).
--
-- E PRECISA de `execute` para `authenticated`. A expressão de uma policy é
-- avaliada com o privilégio de QUEM CONSULTA, não do dono da tabela — sem o
-- grant, todo `select` em `waitlist` morre com `permission denied for function
-- student_has_teacher`. É por isso que `is_teacher`, `is_teacher_of`,
-- `is_admin` e `can_view_context` estão todas na lista de grants da migration
-- inicial. O que o `security definer` resolve é outra coisa: a leitura de
-- `student_teacher_links` lá dentro, que a RLS de quem consulta bloquearia.

create or replace function public.student_has_teacher(p_student_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.student_teacher_links v
     where v.student_id = p_student_id and v.ended_at is null
  );
$$;

comment on function public.student_has_teacher(uuid) is
  'Predicado de policy: o aluno já tem professor vigente? Sem grant — só a RLS a usa.';

-- Revogar de PUBLIC e reconceder nominalmente, como as demais: o default do
-- Postgres concede EXECUTE ao grantee vazio, que `anon` também herda (BUG-14).
revoke execute on function public.student_has_teacher(uuid) from public;
grant execute on function public.student_has_teacher(uuid) to authenticated;

-- =============================================================================
-- 2. A LISTA DE ESPERA VIRA FILA DE CANDIDATOS
-- =============================================================================
-- Aditiva: `waitlist_own` continua como está e as duas policies são combinadas
-- com `or`. Esta é `for select` — o professor lê a fila e não escreve nela.
-- Quem grava `teacher_id` é `link_student`, que é `security definer`.
--
-- Um candidato já reivindicado por outro professor não aparece: é o
-- `not student_has_teacher(...)`, e é o que impede a fila de virar um diretório
-- de alunos alheios (R-VINC-04).

drop policy if exists waitlist_teacher_read on public.waitlist;
create policy waitlist_teacher_read on public.waitlist for select to authenticated
  using (
    public.is_teacher()
    and (
      teacher_id = auth.uid()
      or (teacher_id is null and not public.student_has_teacher(student_id))
    )
  );

-- =============================================================================
-- 3. VINCULAR
-- =============================================================================
-- `student_teacher_links` não tem grant para papel nenhum, e não é para ganhar:
-- o vínculo é o predicado de `is_teacher_of` e portanto a entrada de quinze
-- policies. Conceder `insert` nele seria conceder a capacidade de escolher o
-- que se enxerga.
--
-- Idempotência COM PAYLOAD: `request_id` + `reserve_operation`, com hash de
-- `student_id`. Um duplo clique devolve o vínculo já criado em vez de esbarrar
-- no índice `active_link_uidx`.
create or replace function public.link_student(
  p_student_id uuid,
  p_request_id uuid
)
returns public.student_teacher_links
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid         uuid := auth.uid();
  v_role        public.user_role;
  v_link        public.student_teacher_links%rowtype;
  v_reservation record;
begin
  if v_uid is null then raise exception 'usuario nao autenticado' using errcode='28000'; end if;
  if not public.is_teacher() then
    raise exception 'somente professor pode vincular aluno' using errcode='42501';
  end if;

  select * into v_reservation from public.reserve_operation(
    p_request_id, 'link_student', p_student_id, p_student_id::text
  );

  -- Replay: devolve o vínculo vigente deste professor com este aluno.
  if not v_reservation.reserved then
    select * into v_link from public.student_teacher_links v
     where v.student_id = p_student_id and v.teacher_id = v_uid and v.ended_at is null;
    if found then return v_link; end if;
  end if;

  select p.role into v_role from public.profiles p where p.id = p_student_id;
  if not found then raise exception 'aluno nao encontrado'; end if;
  if v_role <> 'student' then
    raise exception 'so e possivel vincular um perfil de aluno';
  end if;

  -- Um professor vigente por aluno. O índice parcial active_link_uidx é a rede
  -- embaixo e é ele que segura duas requisições simultâneas; esta checagem
  -- existe para a mensagem ser legível no caminho normal.
  select * into v_link from public.student_teacher_links v
   where v.student_id = p_student_id and v.ended_at is null;
  if found then
    if v_link.teacher_id = v_uid then return v_link; end if;
    raise exception 'este aluno ja tem professor vigente';
  end if;

  -- teacher_id é auth.uid(), nunca parâmetro: não existe vincular aluno ao
  -- professor alheio (R-VINC-08).
  insert into public.student_teacher_links (student_id, teacher_id)
  values (p_student_id, v_uid)
  returning * into v_link;

  -- Tira o candidato da fila compartilhada. Aluno sem linha na lista de espera
  -- é vinculável do mesmo jeito: o update simplesmente não acha linha.
  update public.waitlist set teacher_id = v_uid
   where student_id = p_student_id and teacher_id is null;

  update public.operations
     set result = jsonb_build_object('link_id', v_link.id, 'student_id', p_student_id)
   where request_id = p_request_id;

  return v_link;
end;
$$;

comment on function public.link_student(uuid, uuid) is
  'Vincula um aluno ao professor autenticado e reivindica a linha da lista de espera. Idempotente por request_id + reserve_operation (payload: student_id).';

-- =============================================================================
-- 4. GRANTS
-- =============================================================================
-- O default do Postgres concede EXECUTE a PUBLIC, que não é `anon` nem
-- `authenticated`. Ver BUG-14.
revoke execute on function public.link_student(uuid, uuid) from public;
grant execute on function public.link_student(uuid, uuid) to authenticated;

-- Liberar e suspender acesso NÃO ganham RPC: `subscriptions` está na linha de
-- planejamento da tabela de fronteira e já tem as três defesas desde a
-- migration inicial — WITH CHECK com is_teacher_of no insert e no update, e
-- grant update por coluna com student_id de fora. Nada a acrescentar aqui.
