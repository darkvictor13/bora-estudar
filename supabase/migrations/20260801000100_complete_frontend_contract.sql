-- Completa o contrato transacional necessário às telas de administração e
-- planejamento. Os cálculos de desempenho permanecem fora desta migration.

begin;

-- -----------------------------------------------------------------------------
-- Administração de perfis
-- -----------------------------------------------------------------------------

create or replace function public.administrar_perfil(
  p_usuario_id uuid,
  p_tipo public.tipo_perfil,
  p_ativo boolean default true
)
returns public.profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_atual public.profiles;
  v_resultado public.profiles;
  v_operation_id uuid := gen_random_uuid();
  v_reason text;
begin
  perform private.require_authenticated();

  -- Serializa mudanças administrativas para impedir que dois administradores
  -- removam simultaneamente o acesso um do outro e deixem o sistema órfão.
  perform pg_advisory_xact_lock(
    hashtextextended('administrar_perfil:admin-invariant', 0)
  );

  if not public.eh_admin() then
    raise exception 'somente administrador pode administrar perfis'
      using errcode = '42501';
  end if;
  if p_usuario_id is null or p_tipo is null or p_ativo is null then
    raise exception 'usuário, tipo e situação são obrigatórios'
      using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('administrar_perfil:' || p_usuario_id::text, 0)
  );

  select *
    into v_atual
  from public.profiles
  where id = p_usuario_id
    and deleted_at is null
  for update;

  if v_atual.id is null then
    raise exception 'perfil não encontrado ou excluído'
      using errcode = 'P0002';
  end if;

  if p_usuario_id = auth.uid()
     and (p_tipo <> 'admin' or not p_ativo) then
    raise exception 'administrador não pode remover o próprio acesso administrativo'
      using errcode = '22023';
  end if;

  if v_atual.tipo = 'admin'
     and v_atual.ativo
     and (p_tipo <> 'admin' or not p_ativo)
     and not exists (
       select 1
       from public.profiles outro_admin
       where outro_admin.id <> p_usuario_id
         and outro_admin.tipo = 'admin'
         and outro_admin.ativo
         and outro_admin.deleted_at is null
     ) then
    raise exception 'não é permitido remover o último administrador ativo'
      using errcode = '23514';
  end if;

  -- Um vínculo ativo precisa continuar apontando para papéis ativos e
  -- compatíveis. O administrador deve encerrar o vínculo antes da mudança.
  if (not p_ativo or p_tipo <> 'professor') and exists (
    select 1
    from public.professor_alunos pa
    where pa.professor_id = p_usuario_id
      and pa.status = 'ativo'
      and pa.deleted_at is null
  ) then
    raise exception 'encerre os vínculos ativos do professor antes de alterar o perfil'
      using errcode = '23514';
  end if;

  if (not p_ativo or p_tipo <> 'aluno') and exists (
    select 1
    from public.professor_alunos pa
    where pa.aluno_id = p_usuario_id
      and pa.status = 'ativo'
      and pa.deleted_at is null
  ) then
    raise exception 'encerre o vínculo ativo do aluno antes de alterar o perfil'
      using errcode = '23514';
  end if;

  if (not p_ativo or p_tipo <> 'aluno') and exists (
    select 1
    from public.planejamentos p
    where p.aluno_id = p_usuario_id
      and p.status = 'ativo'
      and p.deleted_at is null
  ) then
    raise exception 'arquive o planejamento ativo do aluno antes de alterar o perfil'
      using errcode = '23514';
  end if;

  if (not p_ativo or p_tipo <> 'aluno') and exists (
    select 1
    from public.acessos_aluno a
    where a.aluno_id = p_usuario_id
      and a.status = 'ativo'
      and a.deleted_at is null
      and coalesce(a.inicio_em, current_date) <= current_date
      and (a.expira_em is null or a.expira_em >= current_date)
  ) then
    raise exception 'bloqueie ou cancele o acesso ativo do aluno antes de alterar o perfil'
      using errcode = '23514';
  end if;

  if v_atual.tipo = p_tipo and v_atual.ativo = p_ativo then
    return v_atual;
  end if;

  v_reason := format(
    'administração de perfil: tipo %s -> %s; ativo %s -> %s',
    v_atual.tipo,
    p_tipo,
    v_atual.ativo,
    p_ativo
  );
  perform set_config('app.audit_reason', v_reason, true);
  perform set_config('app.audit_operation_id', v_operation_id::text, true);

  update public.profiles
     set tipo = p_tipo,
         ativo = p_ativo
   where id = p_usuario_id
     and deleted_at is null
   returning * into v_resultado;

  return v_resultado;
end;
$$;

comment on function public.administrar_perfil(uuid, public.tipo_perfil, boolean)
is 'Administra tipo e situação de perfil com validação dos vínculos, acesso e planejamento ativos.';

-- -----------------------------------------------------------------------------
-- Cadernos personalizados do planejamento
-- -----------------------------------------------------------------------------

create or replace function public.salvar_planejamento_caderno(
  p_planejamento_disciplina_id uuid,
  p_nome text,
  p_link_tec text default null,
  p_total_questoes integer default 0,
  p_ordem integer default null,
  p_ativo boolean default true,
  p_caderno_id uuid default null
)
returns public.planejamento_cadernos
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_planejamento_id uuid;
  v_aluno_id uuid;
  v_ordem integer;
  v_item public.planejamento_cadernos;
  v_operation_id uuid := gen_random_uuid();
begin
  perform private.require_authenticated();

  if p_planejamento_disciplina_id is null then
    raise exception 'disciplina do planejamento é obrigatória'
      using errcode = '22023';
  end if;
  if length(btrim(coalesce(p_nome, ''))) = 0 then
    raise exception 'nome do caderno é obrigatório'
      using errcode = '22023';
  end if;
  if p_total_questoes is null or p_total_questoes < 0 then
    raise exception 'total de questões deve ser maior ou igual a zero'
      using errcode = '22023';
  end if;
  if p_ordem is not null and p_ordem < 0 then
    raise exception 'ordem deve ser maior ou igual a zero'
      using errcode = '22023';
  end if;
  if p_ativo is null then
    raise exception 'situação do caderno é obrigatória'
      using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('planejamento_caderno:' || p_planejamento_disciplina_id::text, 0)
  );

  select pd.planejamento_id, p.aluno_id
    into v_planejamento_id, v_aluno_id
  from public.planejamento_disciplinas pd
  join public.planejamentos p on p.id = pd.planejamento_id
  where pd.id = p_planejamento_disciplina_id
    and pd.deleted_at is null
    and p.deleted_at is null
  for update of pd;

  if v_planejamento_id is null then
    raise exception 'disciplina do planejamento não encontrada ou excluída'
      using errcode = 'P0002';
  end if;
  if not (
    public.professor_tem_aluno(v_aluno_id)
    or public.eh_admin()
  ) then
    raise exception 'sem permissão para configurar caderno do planejamento'
      using errcode = '42501';
  end if;

  perform set_config('app.audit_reason', 'manutenção de caderno personalizado do planejamento', true);
  perform set_config('app.audit_operation_id', v_operation_id::text, true);

  if p_caderno_id is null then
    if p_ordem is null then
      select coalesce(max(pc.ordem), -1) + 1
        into v_ordem
      from public.planejamento_cadernos pc
      where pc.planejamento_disciplina_id = p_planejamento_disciplina_id
        and pc.deleted_at is null;
    else
      v_ordem := p_ordem;
    end if;

    insert into public.planejamento_cadernos (
      planejamento_disciplina_id,
      caderno_catalogo_id,
      nome,
      link_tec,
      total_questoes,
      ordem,
      ativo
    ) values (
      p_planejamento_disciplina_id,
      null,
      btrim(p_nome),
      nullif(btrim(p_link_tec), ''),
      p_total_questoes,
      v_ordem,
      p_ativo
    )
    returning * into v_item;
  else
    select *
      into v_item
    from public.planejamento_cadernos pc
    where pc.id = p_caderno_id
      and pc.planejamento_disciplina_id = p_planejamento_disciplina_id
      and pc.caderno_catalogo_id is null
      and pc.deleted_at is null
    for update;

    if v_item.id is null then
      raise exception 'caderno personalizado não encontrado ou excluído'
        using errcode = 'P0002';
    end if;

    update public.planejamento_cadernos
       set nome = btrim(p_nome),
           link_tec = nullif(btrim(p_link_tec), ''),
           total_questoes = p_total_questoes,
           ordem = coalesce(p_ordem, ordem),
           ativo = p_ativo
     where id = p_caderno_id
     returning * into v_item;
  end if;

  return v_item;
end;
$$;

comment on function public.salvar_planejamento_caderno(
  uuid, text, text, integer, integer, boolean, uuid
)
is 'Cria ou atualiza somente cadernos personalizados do snapshot de um planejamento.';

-- -----------------------------------------------------------------------------
-- Exclusão lógica excepcional de planejamento
-- -----------------------------------------------------------------------------

create or replace function public.excluir_planejamento(
  p_planejamento_id uuid,
  p_motivo text,
  p_confirmar_historico boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_planejamento public.planejamentos;
  v_total_metas integer;
  v_metas_concluidas integer;
  v_deleted_at timestamptz;
  v_operation_id uuid := gen_random_uuid();
begin
  perform private.require_authenticated();

  if p_planejamento_id is null then
    raise exception 'planejamento é obrigatório'
      using errcode = '22023';
  end if;
  if length(btrim(coalesce(p_motivo, ''))) = 0 then
    raise exception 'motivo da exclusão é obrigatório'
      using errcode = '22023';
  end if;

  select *
    into v_planejamento
  from public.planejamentos p
  where p.id = p_planejamento_id
    and p.deleted_at is null
  for update;

  if v_planejamento.id is null then
    raise exception 'planejamento não encontrado ou já excluído'
      using errcode = 'P0002';
  end if;
  if not (
    public.professor_tem_aluno(v_planejamento.aluno_id)
    or public.eh_admin()
  ) then
    raise exception 'sem permissão para excluir planejamento'
      using errcode = '42501';
  end if;

  select
    count(*)::integer,
    count(*) filter (where m.status = 'concluida')::integer
    into v_total_metas, v_metas_concluidas
  from public.metas m
  where m.planejamento_id = p_planejamento_id
    and m.deleted_at is null;

  if v_metas_concluidas > 0 and not coalesce(p_confirmar_historico, false) then
    raise exception 'exclusão exige confirmação explícita: % de % metas estão concluídas',
      v_metas_concluidas,
      v_total_metas
      using errcode = '22023';
  end if;

  perform set_config(
    'app.audit_reason',
    'exclusão lógica de planejamento: ' || btrim(p_motivo),
    true
  );
  perform set_config('app.audit_operation_id', v_operation_id::text, true);

  update public.planejamentos
     set deleted_at = now(),
         deleted_by = auth.uid(),
         delete_reason = btrim(p_motivo),
         delete_operation_id = v_operation_id
   where id = p_planejamento_id
     and deleted_at is null
   returning deleted_at into v_deleted_at;

  return jsonb_build_object(
    'planejamento_id', p_planejamento_id,
    'total_metas', v_total_metas,
    'metas_concluidas', v_metas_concluidas,
    'metas_nao_concluidas', v_total_metas - v_metas_concluidas,
    'deleted_at', v_deleted_at,
    'operation_id', v_operation_id
  );
end;
$$;

comment on function public.excluir_planejamento(uuid, text, boolean)
is 'Exclui logicamente um planejamento e exige confirmação adicional quando há metas concluídas.';

-- -----------------------------------------------------------------------------
-- Geração automática e substituição semanal
-- -----------------------------------------------------------------------------

create or replace function public.gerar_metas_semana(
  p_planejamento_id uuid,
  p_semana integer,
  p_disciplinas jsonb,
  p_total_metas integer default null,
  p_replanejar_tudo boolean default false,
  p_confirmar_historico boolean default false
)
returns setof public.metas
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_planejamento public.planejamentos;
  v_item jsonb;
  v_registro record;
  v_input_ids uuid[] := '{}'::uuid[];
  v_ids uuid[] := '{}'::uuid[];
  v_specs jsonb[] := '{}'::jsonb[];
  v_nomes text[] := '{}'::text[];
  v_tipos public.tipo_meta[] := '{}'::public.tipo_meta[];
  v_pesos numeric[] := '{}'::numeric[];
  v_minimos integer[] := '{}'::integer[];
  v_maximos integer[] := '{}'::integer[];
  v_ordens integer[] := '{}'::integer[];
  v_preservadas integer[];
  v_alocadas integer[];
  v_restantes integer[];
  v_incrementos integer[];
  v_restos numeric[];
  v_quantidade_disciplinas integer := 0;
  v_total integer;
  v_preservadas_total integer := 0;
  v_preservadas_fora integer := 0;
  v_concluidas integer := 0;
  v_total_selecionado integer;
  v_soma_minimos integer := 0;
  v_soma_maximos integer := 0;
  v_a_distribuir integer;
  v_total_incrementos integer;
  v_peso_disponivel numeric;
  v_quota numeric;
  v_capacidade integer;
  v_incremento integer;
  v_contagem integer;
  v_houve_limite boolean;
  v_indices integer[];
  v_indice integer;
  v_i integer;
  v_pd_id uuid;
  v_tipo_text text;
  v_tipo public.tipo_meta;
  v_tempo integer;
  v_dias integer[];
  v_dia integer;
  v_dia_contagens integer[] := array_fill(0, array[7]);
  v_tem_alternativa boolean;
  v_ultima_disciplina uuid;
  v_metas jsonb := '[]'::jsonb;
  v_total_gerar integer := 0;
  v_caderno_ids uuid[] := '{}'::uuid[];
  v_caderno_pd_ids uuid[] := '{}'::uuid[];
  v_caderno_ordens integer[] := '{}'::integer[];
  v_caderno_total_usos integer[] := '{}'::integer[];
  v_caderno_semana_usos integer[] := '{}'::integer[];
  v_caderno_gerados integer[] := '{}'::integer[];
  v_caderno_indice integer;
  v_caderno_id uuid;
  v_replanejar_tudo boolean := coalesce(p_replanejar_tudo, false);
  v_confirmar_historico boolean := coalesce(p_confirmar_historico, false);
begin
  perform private.require_authenticated();

  if p_planejamento_id is null then
    raise exception 'planejamento é obrigatório'
      using errcode = '22023';
  end if;
  if p_semana is null or p_semana < 1 then
    raise exception 'semana deve ser maior ou igual a um'
      using errcode = '22023';
  end if;
  if jsonb_typeof(p_disciplinas) <> 'array'
     or jsonb_array_length(p_disciplinas) = 0 then
    raise exception 'informe ao menos uma disciplina para geração'
      using errcode = '22023';
  end if;

  select *
    into v_planejamento
  from public.planejamentos p
  where p.id = p_planejamento_id
    and p.status = 'ativo'
    and p.deleted_at is null
  for update;

  if v_planejamento.id is null then
    raise exception 'planejamento ativo não encontrado'
      using errcode = 'P0002';
  end if;
  if not (
    public.professor_tem_aluno(v_planejamento.aluno_id)
    or public.eh_admin()
  ) then
    raise exception 'sem permissão para gerar metas'
      using errcode = '42501';
  end if;

  v_total := coalesce(p_total_metas, v_planejamento.metas_semanais);
  if v_total not between 1 and 100 then
    raise exception 'total semanal deve ficar entre 1 e 100'
      using errcode = '22023';
  end if;
  if v_total <> v_planejamento.metas_semanais then
    raise exception 'total informado (%) diverge da configuração do planejamento (%)',
      v_total,
      v_planejamento.metas_semanais
      using errcode = '22023';
  end if;

  -- Validação estrutural antecipada evita casts ambíguos no carregamento das
  -- configurações e garante ao menos um dia permitido por disciplina.
  for v_item in
    select value
    from jsonb_array_elements(p_disciplinas)
  loop
    if jsonb_typeof(v_item) <> 'object' then
      raise exception 'cada configuração de disciplina deve ser um objeto'
        using errcode = '22023';
    end if;

    begin
      v_pd_id := nullif(v_item ->> 'planejamento_disciplina_id', '')::uuid;
    exception when invalid_text_representation then
      raise exception 'planejamento_disciplina_id inválido'
        using errcode = '22023';
    end;

    if v_pd_id is null then
      raise exception 'planejamento_disciplina_id é obrigatório'
        using errcode = '22023';
    end if;
    if v_pd_id = any(v_input_ids) then
      raise exception 'disciplina repetida na configuração de geração'
        using errcode = '22023';
    end if;
    v_input_ids := array_append(v_input_ids, v_pd_id);

    if jsonb_typeof(v_item -> 'dias_permitidos') <> 'array'
       or jsonb_array_length(v_item -> 'dias_permitidos') = 0 then
      raise exception 'toda disciplina selecionada exige ao menos um dia permitido'
        using errcode = '22023';
    end if;
    if exists (
      select 1
      from jsonb_array_elements_text(v_item -> 'dias_permitidos') as dia(valor)
      where dia.valor !~ '^[1-7]$'
    ) then
      raise exception 'dias permitidos devem ser inteiros entre 1 e 7'
        using errcode = '22023';
    end if;

    v_tipo_text := nullif(btrim(v_item ->> 'tipo'), '');
    if v_tipo_text is not null and v_tipo_text not in ('bloco', 'teoria') then
      raise exception 'tipo automático deve ser bloco ou teoria'
        using errcode = '22023';
    end if;

    if v_item ? 'tempo_previsto_minutos' then
      if (v_item ->> 'tempo_previsto_minutos') !~ '^[0-9]+$'
         or (v_item ->> 'tempo_previsto_minutos')::integer not between 1 and 240 then
        raise exception 'tempo previsto deve ficar entre 1 e 240 minutos'
          using errcode = '22023';
      end if;
    end if;
  end loop;

  for v_registro in
    select
      pd.id,
      pd.disciplina_nome_snapshot,
      pd.modalidade,
      pd.peso,
      pd.minimo_metas,
      pd.maximo_metas,
      pd.ordem,
      entrada.spec
    from jsonb_array_elements(p_disciplinas) with ordinality as entrada(spec, posicao)
    join public.planejamento_disciplinas pd
      on pd.id = (entrada.spec ->> 'planejamento_disciplina_id')::uuid
    where pd.planejamento_id = p_planejamento_id
      and pd.ativo
      and pd.deleted_at is null
    order by pd.ordem, entrada.posicao, pd.id
  loop
    v_tipo_text := nullif(btrim(v_registro.spec ->> 'tipo'), '');
    v_tipo := case
      when v_tipo_text is not null then v_tipo_text::public.tipo_meta
      when v_registro.modalidade = 'teoria' then 'teoria'::public.tipo_meta
      else 'bloco'::public.tipo_meta
    end;

    if v_tipo = 'bloco' and v_registro.modalidade not in ('blocos', 'ambos') then
      raise exception 'disciplina % não aceita metas de bloco',
        v_registro.disciplina_nome_snapshot
        using errcode = '23514';
    end if;
    if v_tipo = 'teoria' and v_registro.modalidade not in ('teoria', 'ambos') then
      raise exception 'disciplina % não aceita metas de teoria',
        v_registro.disciplina_nome_snapshot
        using errcode = '23514';
    end if;
    if v_tipo = 'teoria' and v_planejamento.modelo_estudo = 'somente_blocos' then
      raise exception 'planejamento somente_blocos não aceita metas de teoria'
        using errcode = '23514';
    end if;

    v_ids := array_append(v_ids, v_registro.id);
    v_specs := array_append(v_specs, v_registro.spec);
    v_nomes := array_append(v_nomes, v_registro.disciplina_nome_snapshot);
    v_tipos := array_append(v_tipos, v_tipo);
    v_pesos := array_append(v_pesos, v_registro.peso);
    v_minimos := array_append(v_minimos, v_registro.minimo_metas);
    v_maximos := array_append(v_maximos, v_registro.maximo_metas);
    v_ordens := array_append(v_ordens, v_registro.ordem);
    v_quantidade_disciplinas := v_quantidade_disciplinas + 1;
  end loop;

  if v_quantidade_disciplinas <> cardinality(v_input_ids) then
    raise exception 'uma ou mais disciplinas não pertencem ao planejamento ou estão inativas'
      using errcode = '23514';
  end if;

  select count(*)::integer
    into v_concluidas
  from public.metas m
  where m.planejamento_id = p_planejamento_id
    and m.semana_numero = p_semana
    and m.tipo in ('bloco', 'teoria')
    and m.status = 'concluida'
    and m.deleted_at is null;

  if v_replanejar_tudo and v_concluidas > 0 and not v_confirmar_historico then
    raise exception 'replanejamento completo exige confirmação do histórico concluído'
      using errcode = '22023';
  end if;

  if not v_replanejar_tudo then
    v_preservadas_total := v_concluidas;

    select count(*)::integer
      into v_preservadas_fora
    from public.metas m
    where m.planejamento_id = p_planejamento_id
      and m.semana_numero = p_semana
      and m.tipo in ('bloco', 'teoria')
      and m.status = 'concluida'
      and m.deleted_at is null
      and not (m.planejamento_disciplina_id = any(v_ids));
  end if;

  v_total_selecionado := v_total - v_preservadas_fora;
  if v_total_selecionado < 0 then
    raise exception 'metas concluídas preservadas excedem o total semanal configurado'
      using errcode = '23514';
  end if;

  v_preservadas := array_fill(0, array[v_quantidade_disciplinas]);
  v_alocadas := array_fill(0, array[v_quantidade_disciplinas]);

  for v_i in 1..v_quantidade_disciplinas loop
    if not v_replanejar_tudo then
      select count(*)::integer
        into v_contagem
      from public.metas m
      where m.planejamento_id = p_planejamento_id
        and m.planejamento_disciplina_id = v_ids[v_i]
        and m.semana_numero = p_semana
        and m.tipo in ('bloco', 'teoria')
        and m.status = 'concluida'
        and m.deleted_at is null;
      v_preservadas[v_i] := v_contagem;
    end if;

    if v_preservadas[v_i] > v_maximos[v_i] then
      raise exception 'disciplina % já possui % metas concluídas, acima do máximo %',
        v_nomes[v_i],
        v_preservadas[v_i],
        v_maximos[v_i]
        using errcode = '23514';
    end if;

    v_alocadas[v_i] := greatest(v_minimos[v_i], v_preservadas[v_i]);
    v_soma_minimos := v_soma_minimos + v_alocadas[v_i];
    v_soma_maximos := v_soma_maximos + v_maximos[v_i];
  end loop;

  if v_soma_minimos > v_total_selecionado then
    raise exception 'a soma dos mínimos e das metas preservadas (%) excede o total disponível (%)',
      v_soma_minimos,
      v_total_selecionado
      using errcode = '23514';
  end if;
  if v_soma_maximos < v_total_selecionado then
    raise exception 'a soma dos máximos (%) não comporta o total necessário (%)',
      v_soma_maximos,
      v_total_selecionado
      using errcode = '23514';
  end if;

  -- Hamilton com redistribuição quando uma disciplina alcança o máximo. Os
  -- mínimos entram como base; os assentos restantes seguem os maiores restos.
  v_a_distribuir := v_total_selecionado - v_soma_minimos;
  while v_a_distribuir > 0 loop
    v_peso_disponivel := 0;
    for v_i in 1..v_quantidade_disciplinas loop
      if v_alocadas[v_i] < v_maximos[v_i] then
        v_peso_disponivel := v_peso_disponivel + v_pesos[v_i];
      end if;
    end loop;

    if v_peso_disponivel <= 0 then
      raise exception 'não há capacidade para completar a distribuição semanal'
        using errcode = '23514';
    end if;

    v_incrementos := array_fill(0, array[v_quantidade_disciplinas]);
    v_restos := array_fill(0::numeric, array[v_quantidade_disciplinas]);
    v_total_incrementos := 0;
    v_houve_limite := false;

    for v_i in 1..v_quantidade_disciplinas loop
      if v_alocadas[v_i] < v_maximos[v_i] then
        v_capacidade := v_maximos[v_i] - v_alocadas[v_i];
        v_quota := v_a_distribuir * v_pesos[v_i] / v_peso_disponivel;
        v_incremento := least(v_capacidade, floor(v_quota)::integer);
        v_incrementos[v_i] := v_incremento;
        v_restos[v_i] := v_quota - floor(v_quota);
        v_total_incrementos := v_total_incrementos + v_incremento;
        if v_quota > v_capacidade then
          v_houve_limite := true;
        end if;
      end if;
    end loop;

    for v_i in 1..v_quantidade_disciplinas loop
      v_alocadas[v_i] := v_alocadas[v_i] + v_incrementos[v_i];
    end loop;
    v_a_distribuir := v_a_distribuir - v_total_incrementos;

    if v_a_distribuir = 0 then
      exit;
    end if;
    if v_houve_limite then
      continue;
    end if;

    select array_agg(candidato.indice order by candidato.resto desc, candidato.ordem, candidato.id)
      into v_indices
    from (
      select
        indice,
        v_restos[indice] as resto,
        v_ordens[indice] as ordem,
        v_ids[indice] as id
      from generate_subscripts(v_ids, 1) as indice
      where v_alocadas[indice] < v_maximos[indice]
      order by v_restos[indice] desc, v_ordens[indice], v_ids[indice]
      limit v_a_distribuir
    ) as candidato;

    if coalesce(cardinality(v_indices), 0) = 0 then
      raise exception 'não foi possível resolver os maiores restos da distribuição'
        using errcode = '23514';
    end if;

    foreach v_indice in array v_indices loop
      v_alocadas[v_indice] := v_alocadas[v_indice] + 1;
      v_a_distribuir := v_a_distribuir - 1;
    end loop;
  end loop;

  v_restantes := array_fill(0, array[v_quantidade_disciplinas]);
  for v_i in 1..v_quantidade_disciplinas loop
    v_restantes[v_i] := v_alocadas[v_i] - v_preservadas[v_i];
    v_total_gerar := v_total_gerar + v_restantes[v_i];
  end loop;

  -- Contagens iniciais consideram apenas registros que sobreviverão à forma
  -- escolhida de substituição. Isso mantém o rodízio de dias e cadernos estável.
  for v_registro in
    select m.dia_semana, count(*)::integer as quantidade
    from public.metas m
    where m.planejamento_id = p_planejamento_id
      and m.semana_numero = p_semana
      and m.deleted_at is null
      and not (
        m.tipo in ('bloco', 'teoria')
        and (
          v_replanejar_tudo
          or m.status in ('pendente', 'em_andamento', 'pulada')
        )
      )
    group by m.dia_semana
  loop
    v_dia_contagens[v_registro.dia_semana] := v_registro.quantidade;
  end loop;

  for v_registro in
    select
      pc.id,
      pc.planejamento_disciplina_id,
      pc.ordem,
      count(m.id) filter (
        where not (
          m.semana_numero = p_semana
          and m.tipo in ('bloco', 'teoria')
          and (
            v_replanejar_tudo
            or m.status in ('pendente', 'em_andamento', 'pulada')
          )
        )
      )::integer as total_usos,
      count(m.id) filter (
        where m.semana_numero = p_semana
          and not (
            m.tipo in ('bloco', 'teoria')
            and (
              v_replanejar_tudo
              or m.status in ('pendente', 'em_andamento', 'pulada')
            )
          )
      )::integer as semana_usos
    from public.planejamento_cadernos pc
    left join public.metas m
      on m.planejamento_caderno_id = pc.id
     and m.deleted_at is null
    where pc.planejamento_disciplina_id = any(v_ids)
      and pc.ativo
      and pc.deleted_at is null
    group by pc.id, pc.planejamento_disciplina_id, pc.ordem
    order by pc.planejamento_disciplina_id, pc.ordem, pc.id
  loop
    v_caderno_ids := array_append(v_caderno_ids, v_registro.id);
    v_caderno_pd_ids := array_append(v_caderno_pd_ids, v_registro.planejamento_disciplina_id);
    v_caderno_ordens := array_append(v_caderno_ordens, v_registro.ordem);
    v_caderno_total_usos := array_append(v_caderno_total_usos, v_registro.total_usos);
    v_caderno_semana_usos := array_append(v_caderno_semana_usos, v_registro.semana_usos);
    v_caderno_gerados := array_append(v_caderno_gerados, 0);
  end loop;

  -- A disciplina com mais itens pendentes é escolhida primeiro; quando existe
  -- alternativa, a última disciplina usada é temporariamente preterida.
  while exists (
    select 1
    from generate_subscripts(v_restantes, 1) as indice
    where v_restantes[indice] > 0
  ) loop
    select exists (
      select 1
      from generate_subscripts(v_restantes, 1) as alternativa
      where v_restantes[alternativa] > 0
        and v_ids[alternativa] is distinct from v_ultima_disciplina
    ) into v_tem_alternativa;

    select indice
      into v_indice
    from generate_subscripts(v_restantes, 1) as indice
    where v_restantes[indice] > 0
    order by
      case
        when v_tem_alternativa and v_ids[indice] = v_ultima_disciplina then 1
        else 0
      end,
      v_restantes[indice] desc,
      v_ordens[indice],
      v_ids[indice]
    limit 1;

    select array_agg(dia order by primeira_posicao)
      into v_dias
    from (
      select valor::integer as dia, min(posicao) as primeira_posicao
      from jsonb_array_elements_text(v_specs[v_indice] -> 'dias_permitidos')
        with ordinality as permitido(valor, posicao)
      group by valor::integer
    ) as dias_unicos;

    select dia
      into v_dia
    from unnest(v_dias) with ordinality as permitido(dia, posicao)
    order by v_dia_contagens[dia], posicao
    limit 1;

    v_tipo := v_tipos[v_indice];
    v_caderno_id := null;
    if v_tipo = 'bloco' then
      select indice
        into v_caderno_indice
      from generate_subscripts(v_caderno_ids, 1) as indice
      where v_caderno_pd_ids[indice] = v_ids[v_indice]
      order by
        v_caderno_semana_usos[indice] + v_caderno_gerados[indice],
        v_caderno_total_usos[indice] + v_caderno_gerados[indice],
        v_caderno_ordens[indice],
        v_caderno_ids[indice]
      limit 1;

      if v_caderno_indice is null then
        raise exception 'disciplina % não possui caderno ativo e não excluído',
          v_nomes[v_indice]
          using errcode = '23514';
      end if;

      v_caderno_id := v_caderno_ids[v_caderno_indice];
      v_caderno_gerados[v_caderno_indice] := v_caderno_gerados[v_caderno_indice] + 1;
    end if;

    v_tempo := coalesce(
      nullif(v_specs[v_indice] ->> 'tempo_previsto_minutos', '')::integer,
      60
    );

    v_metas := v_metas || jsonb_build_array(jsonb_build_object(
      'planejamento_disciplina_id', v_ids[v_indice],
      'planejamento_caderno_id', v_caderno_id,
      'tipo', v_tipo,
      'titulo', coalesce(
        nullif(btrim(v_specs[v_indice] ->> 'titulo'), ''),
        case
          when v_tipo = 'bloco' then 'Questões — ' || v_nomes[v_indice]
          else 'Teoria — ' || v_nomes[v_indice]
        end
      ),
      'descricao', nullif(btrim(v_specs[v_indice] ->> 'descricao'), ''),
      'semana_numero', p_semana,
      'dia_semana', v_dia,
      'tempo_previsto_minutos', v_tempo
    ));

    v_restantes[v_indice] := v_restantes[v_indice] - 1;
    v_dia_contagens[v_dia] := v_dia_contagens[v_dia] + 1;
    v_ultima_disciplina := v_ids[v_indice];
  end loop;

  if jsonb_array_length(v_metas) <> v_total_gerar
     or v_preservadas_total + jsonb_array_length(v_metas) <> v_total then
    raise exception 'falha interna ao montar o total exato de metas'
      using errcode = 'P0001';
  end if;

  -- A RPC existente executa, na mesma transação, o soft delete autorizado,
  -- preserva concluídas na substituição comum, exige confirmação no
  -- replanejamento completo e valida novamente todos os relacionamentos.
  return query
  select *
  from public.substituir_metas_semana(
    p_planejamento_id,
    p_semana,
    v_metas,
    v_replanejar_tudo,
    v_confirmar_historico
  );
end;
$$;

comment on function public.gerar_metas_semana(
  uuid, integer, jsonb, integer, boolean, boolean
)
is 'Distribui metas por mínimos, pesos, máximos e maiores restos; alterna disciplinas e seleciona cadernos elegíveis antes da substituição transacional.';

-- -----------------------------------------------------------------------------
-- Ajustes de contratos existentes necessários às telas
-- -----------------------------------------------------------------------------

create or replace function public.agendar_reforco(
  p_meta_origem_id uuid,
  p_semana integer,
  p_dia smallint default null
)
returns public.metas
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_origem public.metas;
  v_aluno_id uuid;
  v_dia smallint;
  v_ordem integer;
  v_reforco public.metas;
  v_meta_percentual numeric(5,2);
  v_desempenho numeric(7,2);
  v_operation_id uuid := gen_random_uuid();
begin
  perform private.require_authenticated();

  select m.*
    into v_origem
  from public.metas m
  join public.planejamentos p on p.id = m.planejamento_id
  where m.id = p_meta_origem_id
    and m.deleted_at is null
    and p.status = 'ativo'
    and p.deleted_at is null
  for update of m;

  select aluno_id into v_aluno_id
  from public.planejamentos
  where id = v_origem.planejamento_id;

  if v_origem.id is null then
    raise exception 'meta de origem vigente não encontrada'
      using errcode = 'P0002';
  end if;
  if v_origem.status <> 'concluida'
     or v_origem.tipo <> 'bloco'
     or v_origem.questoes_feitas < 1 then
    raise exception 'somente bloco concluído com questões pode originar reforço'
      using errcode = '23514';
  end if;
  if auth.uid() is distinct from v_aluno_id
     and not public.professor_tem_aluno(v_aluno_id)
     and not public.eh_admin() then
    raise exception 'sem permissão para agendar reforço'
      using errcode = '42501';
  end if;
  if p_semana is null or p_semana < 1 then
    raise exception 'semana inválida'
      using errcode = '22023';
  end if;

  select meta_percentual
    into v_meta_percentual
  from public.planejamento_disciplinas
  where id = v_origem.planejamento_disciplina_id
    and deleted_at is null;

  if v_meta_percentual is null then
    raise exception 'configuração vigente da disciplina não encontrada'
      using errcode = 'P0002';
  end if;

  v_desempenho := (v_origem.acertos::numeric * 100) / v_origem.questoes_feitas;
  if v_desempenho >= v_meta_percentual then
    raise exception 'meta de origem já atingiu o percentual exigido'
      using errcode = '23514';
  end if;

  -- RN-REF-009: qualquer reforço concluído que já tenha alcançado a meta
  -- resolve a deficiência da origem. Reforços concluídos abaixo dela não
  -- impedem uma nova tentativa.
  if exists (
    select 1
    from public.metas reforco
    where reforco.origem_meta_id = v_origem.id
      and reforco.tipo = 'reforco'
      and reforco.status = 'concluida'
      and reforco.questoes_feitas > 0
      and reforco.deleted_at is null
      and (reforco.acertos::numeric * 100) / reforco.questoes_feitas
        >= v_meta_percentual
  ) then
    raise exception 'reforço já resolvido para esta meta de origem'
      using errcode = '23514';
  end if;

  v_dia := coalesce(p_dia, v_origem.dia_semana);
  if v_dia not between 1 and 7 then
    raise exception 'dia inválido'
      using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_origem.planejamento_id::text, 2));
  select coalesce(max(ordem_dia), 0) + 1
    into v_ordem
  from public.metas
  where planejamento_id = v_origem.planejamento_id
    and semana_numero = p_semana
    and dia_semana = v_dia
    and deleted_at is null;

  perform set_config('app.audit_reason', 'agendamento de reforço', true);
  perform set_config('app.audit_operation_id', v_operation_id::text, true);

  insert into public.metas (
    planejamento_id, planejamento_disciplina_id, planejamento_caderno_id,
    origem_meta_id, tipo, titulo, semana_numero, dia_semana, ordem_dia,
    tempo_previsto_minutos, created_by
  ) values (
    v_origem.planejamento_id, v_origem.planejamento_disciplina_id,
    v_origem.planejamento_caderno_id, v_origem.id, 'reforco',
    'Reforço - ' || v_origem.titulo, p_semana, v_dia, v_ordem,
    v_origem.tempo_previsto_minutos, auth.uid()
  ) returning * into v_reforco;

  update public.metas
     set reforco_ignorado_em = null
   where id = v_origem.id;

  return v_reforco;
end;
$$;

comment on function public.agendar_reforco(uuid, integer, smallint)
is 'Agenda reforço apenas enquanto nenhuma tentativa concluída da mesma origem tiver atingido a meta percentual.';

create or replace function public.bloquear_acesso(
  p_aluno_id uuid,
  p_motivo text default null
)
returns public.acessos_aluno
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_acesso public.acessos_aluno;
  v_motivo text := nullif(btrim(p_motivo), '');
  v_operation_id uuid := gen_random_uuid();
begin
  perform private.require_authenticated();

  if not (public.eh_admin() or public.professor_tem_aluno(p_aluno_id)) then
    raise exception 'sem permissão para bloquear este aluno'
      using errcode = '42501';
  end if;

  perform set_config(
    'app.audit_reason',
    case
      when v_motivo is null then 'bloqueio de acesso'
      else 'bloqueio de acesso: ' || v_motivo
    end,
    true
  );
  perform set_config('app.audit_operation_id', v_operation_id::text, true);

  update public.acessos_aluno
     set status = 'bloqueado',
         bloqueado_em = now(),
         motivo_bloqueio = v_motivo
   where aluno_id = p_aluno_id
     and status in ('pendente', 'ativo')
     and deleted_at is null
   returning * into v_acesso;

  if v_acesso.id is null then
    raise exception 'acesso corrente não encontrado'
      using errcode = 'P0002';
  end if;

  return v_acesso;
end;
$$;

comment on function public.bloquear_acesso(uuid, text)
is 'Bloqueia acesso com motivo opcional; valor nulo ou vazio é persistido como NULL.';

create or replace function public.atualizar_minha_lista_espera(
  p_whatsapp text,
  p_area_interesse text,
  p_concurso_foco text
)
returns public.lista_espera
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item public.lista_espera;
  v_operation_id uuid := gen_random_uuid();
begin
  if not exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and tipo = 'aluno'
      and ativo
      and deleted_at is null
  ) then
    raise exception 'somente aluno ativo pode usar lista de espera'
      using errcode = '42501';
  end if;

  if length(btrim(coalesce(p_whatsapp, ''))) = 0
     or length(btrim(coalesce(p_area_interesse, ''))) = 0
     or length(btrim(coalesce(p_concurso_foco, ''))) = 0 then
    raise exception 'WhatsApp, área de interesse e concurso em foco são obrigatórios'
      using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('lista_espera:' || auth.uid()::text, 0)
  );
  perform set_config('app.audit_operation_id', v_operation_id::text, true);

  select *
    into v_item
  from public.lista_espera
  where aluno_id = auth.uid()
    and deleted_at is null
  for update;

  if v_item.id is not null then
    perform set_config(
      'app.audit_reason',
      case
        when v_item.status = 'cancelado'
          then 'reativação da própria lista de espera'
        else 'atualização da própria lista de espera'
      end,
      true
    );

    update public.lista_espera
       set whatsapp = btrim(p_whatsapp),
           area_interesse = btrim(p_area_interesse),
           concurso_foco = btrim(p_concurso_foco),
           status = case
             when status = 'cancelado' then 'aguardando'::public.status_lista_espera
             else status
           end
     where id = v_item.id
     returning * into v_item;

    return v_item;
  end if;

  -- A RN-LIS-001 define um registro por aluno. Quando houver histórico
  -- soft-deleted compatível, ele é restaurado e reaproveitado em vez de criar
  -- uma segunda identidade lógica para a mesma inscrição.
  select *
    into v_item
  from public.lista_espera historico
  where historico.aluno_id = auth.uid()
    and historico.deleted_at is not null
    and (
      historico.professor_id is null
      or exists (
        select 1
        from public.profiles professor
        where professor.id = historico.professor_id
          and professor.tipo = 'professor'
          and professor.ativo
          and professor.deleted_at is null
      )
    )
  order by historico.deleted_at desc, historico.created_at desc, historico.id
  limit 1
  for update;

  if v_item.id is not null then
    perform set_config('app.audit_reason', 'restauração da própria lista de espera', true);
    update public.lista_espera
       set deleted_at = null,
           deleted_by = null,
           delete_reason = null,
           delete_operation_id = null
     where id = v_item.id
     returning * into v_item;

    perform set_config('app.audit_reason', 'reativação da própria lista de espera', true);
    update public.lista_espera
       set whatsapp = btrim(p_whatsapp),
           area_interesse = btrim(p_area_interesse),
           concurso_foco = btrim(p_concurso_foco),
           status = 'aguardando'
     where id = v_item.id
     returning * into v_item;

    return v_item;
  end if;

  perform set_config('app.audit_reason', 'entrada na lista de espera', true);
  insert into public.lista_espera (
    aluno_id,
    whatsapp,
    area_interesse,
    concurso_foco,
    status
  ) values (
    auth.uid(),
    btrim(p_whatsapp),
    btrim(p_area_interesse),
    btrim(p_concurso_foco),
    'aguardando'
  )
  returning * into v_item;

  return v_item;
end;
$$;

comment on function public.atualizar_minha_lista_espera(text, text, text)
is 'Atualiza a inscrição própria, reativa cancelada e reaproveita histórico soft-deleted compatível.';

-- A policy geral do schema inicial oculta registros excluídos. O professor
-- vinculado precisa reler o caderno confirmado pelo servidor para poder
-- restaurá-lo; aluno continua restrito à policy original e admin conserva a
-- leitura irrestrita da policy *_admin_all.
create policy planejamento_cadernos_excluidos_professor_select
on public.planejamento_cadernos
for select to authenticated
using (
  deleted_at is not null
  and exists (
    select 1
    from public.planejamento_disciplinas pd
    join public.planejamentos p on p.id = pd.planejamento_id
    where pd.id = planejamento_disciplina_id
      and pd.deleted_at is null
      and p.deleted_at is null
      and public.professor_tem_aluno(p.aluno_id)
  )
);

comment on policy planejamento_cadernos_excluidos_professor_select
on public.planejamento_cadernos
is 'Permite ao professor vinculado reler cadernos excluídos de planejamento vigente para restauração.';

-- Funções SECURITY DEFINER novas não ficam expostas por padrão a anon/public.
revoke all on function public.administrar_perfil(uuid, public.tipo_perfil, boolean)
  from public, anon, authenticated;
revoke all on function public.salvar_planejamento_caderno(
  uuid, text, text, integer, integer, boolean, uuid
) from public, anon, authenticated;
revoke all on function public.excluir_planejamento(uuid, text, boolean)
  from public, anon, authenticated;
revoke all on function public.gerar_metas_semana(
  uuid, integer, jsonb, integer, boolean, boolean
) from public, anon, authenticated;
revoke all on function public.agendar_reforco(uuid, integer, smallint)
  from public, anon, authenticated;
revoke all on function public.bloquear_acesso(uuid, text)
  from public, anon, authenticated;
revoke all on function public.atualizar_minha_lista_espera(text, text, text)
  from public, anon, authenticated;

grant execute on function public.administrar_perfil(uuid, public.tipo_perfil, boolean)
  to authenticated;
grant execute on function public.salvar_planejamento_caderno(
  uuid, text, text, integer, integer, boolean, uuid
) to authenticated;
grant execute on function public.excluir_planejamento(uuid, text, boolean)
  to authenticated;
grant execute on function public.gerar_metas_semana(
  uuid, integer, jsonb, integer, boolean, boolean
) to authenticated;
grant execute on function public.agendar_reforco(uuid, integer, smallint)
  to authenticated;
grant execute on function public.bloquear_acesso(uuid, text)
  to authenticated;
grant execute on function public.atualizar_minha_lista_espera(text, text, text)
  to authenticated;

commit;
