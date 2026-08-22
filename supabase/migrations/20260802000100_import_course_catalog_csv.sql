-- Importa um curso completo do catálogo em uma única transação. O CSV é
-- interpretado pelo frontend e enviado como um payload já validado.

begin;

create or replace function public.importar_curso_csv(
  p_codigo text,
  p_nome text,
  p_area text default null,
  p_concurso_alvo text default null,
  p_fase public.fase_curso default 'pre_edital',
  p_modelo_estudo public.modelo_estudo default 'teoria_blocos',
  p_metas_semanais_padrao integer default 24,
  p_disciplinas jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_curso_id uuid;
  v_curso_disciplina_id uuid;
  v_disciplina_id uuid;
  v_disciplina jsonb;
  v_caderno jsonb;
  v_disciplina_ordem bigint;
  v_caderno_ordem bigint;
  v_total_cadernos integer := 0;
  v_seen_disciplinas text[] := array[]::text[];
  v_discipline_key text;
  v_operation_id uuid := gen_random_uuid();
begin
  perform private.require_authenticated();

  if not public.eh_admin() then
    raise exception 'somente administrador pode importar cursos'
      using errcode = '42501';
  end if;
  if length(btrim(coalesce(p_codigo, ''))) = 0 then
    raise exception 'código do curso é obrigatório'
      using errcode = '22023';
  end if;
  if length(btrim(coalesce(p_nome, ''))) = 0 then
    raise exception 'nome do curso é obrigatório'
      using errcode = '22023';
  end if;
  if p_fase is null or p_modelo_estudo is null then
    raise exception 'fase e modelo de estudo são obrigatórios'
      using errcode = '22023';
  end if;
  if p_metas_semanais_padrao is null
     or p_metas_semanais_padrao not between 1 and 100 then
    raise exception 'metas semanais padrão devem estar entre 1 e 100'
      using errcode = '22023';
  end if;
  if p_disciplinas is null
     or jsonb_typeof(p_disciplinas) <> 'array'
     or jsonb_array_length(p_disciplinas) = 0 then
    raise exception 'informe ao menos uma disciplina para importar'
      using errcode = '22023';
  end if;
  if jsonb_array_length(p_disciplinas) > 200 then
    raise exception 'o limite por importação é de 200 disciplinas'
      using errcode = '22023';
  end if;

  -- Valida todo o payload antes da primeira escrita para produzir erros claros.
  for v_disciplina, v_disciplina_ordem in
    select item.value, item.ordinality
    from jsonb_array_elements(p_disciplinas) with ordinality as item(value, ordinality)
  loop
    if jsonb_typeof(v_disciplina) <> 'object' then
      raise exception 'disciplina % possui formato inválido', v_disciplina_ordem
        using errcode = '22023';
    end if;

    if nullif(btrim(v_disciplina ->> 'disciplina_id'), '') is not null then
      begin
        v_disciplina_id := (v_disciplina ->> 'disciplina_id')::uuid;
      exception when invalid_text_representation then
        raise exception 'disciplina % possui identificador inválido', v_disciplina_ordem
          using errcode = '22023';
      end;
      v_discipline_key := 'id:' || v_disciplina_id::text;
    else
      if length(btrim(coalesce(v_disciplina ->> 'codigo', ''))) = 0
         or length(btrim(coalesce(v_disciplina ->> 'nome', ''))) = 0 then
        raise exception 'código e nome são obrigatórios para a nova disciplina %', v_disciplina_ordem
          using errcode = '22023';
      end if;
      v_discipline_key := 'codigo:' || lower(btrim(v_disciplina ->> 'codigo'));
    end if;

    if v_discipline_key = any(v_seen_disciplinas) then
      raise exception 'a mesma disciplina foi informada mais de uma vez'
        using errcode = '22023';
    end if;
    v_seen_disciplinas := array_append(v_seen_disciplinas, v_discipline_key);

    if jsonb_typeof(v_disciplina -> 'cadernos') <> 'array'
       or jsonb_array_length(v_disciplina -> 'cadernos') = 0 then
      raise exception 'disciplina % precisa ter ao menos um caderno', v_disciplina_ordem
        using errcode = '22023';
    end if;

    for v_caderno, v_caderno_ordem in
      select item.value, item.ordinality
      from jsonb_array_elements(v_disciplina -> 'cadernos') with ordinality as item(value, ordinality)
    loop
      if jsonb_typeof(v_caderno) <> 'object'
         or length(btrim(coalesce(v_caderno ->> 'nome', ''))) = 0 then
        raise exception 'caderno % da disciplina % precisa ter nome', v_caderno_ordem, v_disciplina_ordem
          using errcode = '22023';
      end if;
      if coalesce(v_caderno ->> 'total_questoes', '') !~ '^\d+$' then
        raise exception 'caderno % da disciplina % possui total de questões inválido', v_caderno_ordem, v_disciplina_ordem
          using errcode = '22023';
      end if;
      if (v_caderno ->> 'total_questoes')::numeric > 2147483647 then
        raise exception 'caderno % da disciplina % possui total de questões inválido', v_caderno_ordem, v_disciplina_ordem
          using errcode = '22023';
      end if;
      if nullif(btrim(v_caderno ->> 'link_tec'), '') is not null
         and btrim(v_caderno ->> 'link_tec') !~* '^https?://[^[:space:]]+$' then
        raise exception 'caderno % da disciplina % possui link inválido', v_caderno_ordem, v_disciplina_ordem
          using errcode = '22023';
      end if;

      v_total_cadernos := v_total_cadernos + 1;
      if v_total_cadernos > 5000 then
        raise exception 'o limite por importação é de 5000 cadernos'
          using errcode = '22023';
      end if;
    end loop;
  end loop;

  perform pg_advisory_xact_lock(
    hashtextextended('importar_curso_csv:' || lower(btrim(p_codigo)), 0)
  );
  perform set_config('app.audit_reason', 'importação de curso por CSV', true);
  perform set_config('app.audit_operation_id', v_operation_id::text, true);

  insert into public.cursos (
    codigo,
    nome,
    area,
    concurso_alvo,
    fase,
    modelo_estudo,
    metas_semanais_padrao,
    ativo
  ) values (
    btrim(p_codigo),
    btrim(p_nome),
    nullif(btrim(p_area), ''),
    nullif(btrim(p_concurso_alvo), ''),
    p_fase,
    p_modelo_estudo,
    p_metas_semanais_padrao,
    true
  )
  returning id into v_curso_id;

  for v_disciplina, v_disciplina_ordem in
    select item.value, item.ordinality
    from jsonb_array_elements(p_disciplinas) with ordinality as item(value, ordinality)
  loop
    if nullif(btrim(v_disciplina ->> 'disciplina_id'), '') is not null then
      v_disciplina_id := (v_disciplina ->> 'disciplina_id')::uuid;
      perform 1
      from public.disciplinas d
      where d.id = v_disciplina_id
        and d.ativo
        and d.deleted_at is null
      for update;

      if not found then
        raise exception 'disciplina % não existe ou não está ativa', v_disciplina_ordem
          using errcode = 'P0002';
      end if;
    else
      insert into public.disciplinas (codigo, nome, cor, ativo)
      values (
        btrim(v_disciplina ->> 'codigo'),
        btrim(v_disciplina ->> 'nome'),
        null,
        true
      )
      returning id into v_disciplina_id;
    end if;

    insert into public.curso_disciplinas (
      curso_id,
      disciplina_id,
      modalidade,
      meta_padrao,
      peso_padrao,
      ordem,
      ativo
    ) values (
      v_curso_id,
      v_disciplina_id,
      'blocos',
      80,
      1,
      v_disciplina_ordem - 1,
      true
    )
    returning id into v_curso_disciplina_id;

    for v_caderno, v_caderno_ordem in
      select item.value, item.ordinality
      from jsonb_array_elements(v_disciplina -> 'cadernos') with ordinality as item(value, ordinality)
    loop
      insert into public.cadernos_catalogo (
        curso_disciplina_id,
        nome,
        link_tec,
        total_questoes,
        ordem,
        ativo
      ) values (
        v_curso_disciplina_id,
        btrim(v_caderno ->> 'nome'),
        nullif(btrim(v_caderno ->> 'link_tec'), ''),
        (v_caderno ->> 'total_questoes')::integer,
        v_caderno_ordem - 1,
        true
      );
    end loop;
  end loop;

  return jsonb_build_object(
    'curso_id', v_curso_id,
    'disciplinas', jsonb_array_length(p_disciplinas),
    'cadernos', v_total_cadernos
  );
end;
$$;

comment on function public.importar_curso_csv(
  text,
  text,
  text,
  text,
  public.fase_curso,
  public.modelo_estudo,
  integer,
  jsonb
) is 'Cria curso, disciplinas opcionais, associações e cadernos de catálogo de forma atômica a partir de um CSV validado.';

revoke all on function public.importar_curso_csv(
  text,
  text,
  text,
  text,
  public.fase_curso,
  public.modelo_estudo,
  integer,
  jsonb
) from public, anon;

grant execute on function public.importar_curso_csv(
  text,
  text,
  text,
  text,
  public.fase_curso,
  public.modelo_estudo,
  integer,
  jsonb
) to authenticated;

commit;
