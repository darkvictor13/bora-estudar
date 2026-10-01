\set ON_ERROR_STOP on
-- =============================================================================
-- Conteúdo da biblioteca de flashcards (spec 38)
-- =============================================================================
-- Parte do que `scripts/load-library-flashcards.mjs` carregou antes das suítes:
-- `run.sh` roda a carga logo depois do reset, e o truncate do seed não toca no
-- conteúdo. Tudo aqui é desfeito no fim.
-- =============================================================================
begin;

-- ---------- CA-01: a carga trouxe o arquivo inteiro ----------
do $$
declare
  v_active integer;
  v_view integer;
begin
  select count(*) into v_active from public.library_flashcards where retired_at is null;
  if v_active <> 5108 then
    raise exception 'FALHOU: % cartoes ativos, esperava 5108', v_active;
  end if;
  if (select count(*) from public.library_flashcard_subjects) <> 14 then
    raise exception 'FALHOU: a biblioteca nao tem as 14 materias';
  end if;
  if exists (select 1 from public.library_flashcard_decks where subject_id is null or title is null) then
    raise exception 'FALHOU: deck sem materia ou sem titulo depois da carga';
  end if;
  select sum(active_cards) into v_view from public.vw_library_flashcard_decks;
  if v_view <> v_active or exists (select 1 from public.vw_library_flashcard_decks where active_cards = 0) then
    raise exception 'FALHOU: a contagem da view (%) nao bate com os cartoes ativos (%)', v_view, v_active;
  end if;
  raise notice '01 OK  5108 cartoes ativos, 14 materias, contagem da view confere';
end $$;

-- ---------- CA-02: os oito consolidados de Informática ----------
do $$ begin
  if (select count(*) from public.library_flashcards c
        join public.library_flashcard_aliases a on a.old_deck_id = c.deck_id and a.old_card_id = c.id
        join public.library_flashcards t on t.deck_id = a.deck_id and t.id = a.card_id
       where c.retired_at is not null and t.retired_at is null) <> 8 then
    raise exception 'FALHOU: os oito cartoes consolidados nao estao retirados com alias para um ativo';
  end if;
  raise notice '02 OK  oito cartoes retirados, cada um com alias para um ativo';
end $$;

-- ---------- CA-05: cartão não troca de deck, nem pela manutenção ----------
do $$ begin
  update public.library_flashcards set deck_id = 'pf2029-informatica-02'
   where id = '95e686a3-6c71-4ad9-927f-8036025d3f7d';
  raise exception 'FALHOU: um cartao mudou de deck por UPDATE direto';
exception when check_violation then
  raise notice '03 OK  mudar o deck de um cartao e recusado pelo gatilho';
end $$;

-- ---------- R-BIB-08: alias exige origem retirada e destino ativo ----------
do $$ begin
  update public.library_flashcards set retired_at = now()
   where id = '47008b78-7c57-46bb-b2bd-7ff9b0e8fcf2';  -- destino de um alias
  set constraints public.library_flashcards_alias_endpoints immediate;
  raise exception 'FALHOU: o destino de um alias foi retirado';
exception when check_violation then
  raise notice '04 OK  retirar o destino de um alias e recusado';
end $$;
set constraints all deferred;

do $$ begin
  update public.library_flashcards set retired_at = null
   where id = '7373fee7-2f87-42eb-a3b9-a2ff2eee7bf6';  -- origem de um alias
  set constraints public.library_flashcards_alias_endpoints immediate;
  raise exception 'FALHOU: a origem de um alias foi reativada';
exception when check_violation then
  raise notice '05 OK  reativar a origem de um alias e recusado';
end $$;
set constraints all deferred;

do $$ begin
  delete from public.library_flashcards where id = '47008b78-7c57-46bb-b2bd-7ff9b0e8fcf2';
  raise exception 'FALHOU: um cartao citado por alias foi apagado';
exception when foreign_key_violation then
  raise notice '06 OK  cartao citado por alias nao se apaga';
end $$;

-- ---------- CA-08: quem lê o texto ----------
-- Um aluno recém-cadastrado: o gatilho cria o perfil `pending`, sem professor.
insert into auth.users (instance_id, id, aud, role, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000000', 'b7000000-0000-4000-8000-000000000001',
   'authenticated', 'authenticated', 'gil.biblioteca@x.com', '{"name":"Aluno Gil"}');

set role authenticated;

select app_test.act_as('22222222-2222-4222-8222-222222222222');  -- Bruno, ativo
do $$ begin
  if (select count(*) from public.library_flashcards where retired_at is null) <> 5108 then
    raise exception 'FALHOU: aluno com acesso vigente nao le a biblioteca';
  end if;
  raise notice '07 OK  aluno com acesso vigente le os 5108 cartoes';
end $$;

select app_test.act_as('11111111-1111-4111-8111-111111111111');  -- Ana, professora
do $$ begin
  if (select count(*) from public.library_flashcards where retired_at is null) <> 5108 then
    raise exception 'FALHOU: professor nao le a biblioteca';
  end if;
  raise notice '08 OK  professor le os 5108 cartoes';
end $$;

select app_test.act_as('66666666-6666-4666-8666-666666666666');  -- Fabi, vencida
do $$ begin
  if (select count(*) from public.library_flashcards) <> 0 then
    raise exception 'FALHOU: aluna com acesso vencido le o texto dos cartoes';
  end if;
  if (select count(*) from public.library_flashcard_subjects) <> 14
     or (select count(*) from public.library_flashcard_decks) <> 101 then
    raise exception 'FALHOU: aluna vencida perdeu o indice da biblioteca';
  end if;
  if exists (select 1 from public.vw_library_flashcard_decks where active_cards <> 0) then
    raise exception 'FALHOU: a view conta cartoes que a aluna vencida nao le';
  end if;
  raise notice '09 OK  aluna vencida le o indice e nenhum cartao';
end $$;

select app_test.act_as('b7000000-0000-4000-8000-000000000001');  -- Gil, pendente
do $$ begin
  if (select count(*) from public.library_flashcards) <> 0 then
    raise exception 'FALHOU: aluno pendente le o texto dos cartoes';
  end if;
  raise notice '10 OK  aluno pendente nao le cartao nenhum';
end $$;

reset role;
rollback;
