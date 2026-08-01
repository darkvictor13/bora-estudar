-- Permite que o professor atribua uma revisão específica a um aluno vinculado.
-- O aluno é sempre derivado do planejamento; nunca é aceito como entrada do cliente.

begin;

create or replace function public.criar_revisao(
  p_planejamento_aula_origem_id uuid,
  p_planejamento_aula_revisada_id uuid,
  p_etapa public.etapa_revisao,
  p_prevista_em date
)
returns public.revisoes
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_aluno_id uuid;
  v_disciplina_origem_id uuid;
  v_disciplina_revisada_id uuid;
  v_planejamento_id uuid;
  v_planejamento_status public.status_planejamento;
  v_origem_ativa boolean;
  v_revisada_ativa boolean;
  v_revisao public.revisoes;
begin
  perform private.require_authenticated();

  if p_planejamento_aula_origem_id is null
     or p_planejamento_aula_revisada_id is null then
    raise exception 'aula de origem e aula revisada são obrigatórias';
  end if;

  if p_planejamento_aula_origem_id = p_planejamento_aula_revisada_id then
    raise exception 'aula de origem e aula revisada devem ser diferentes';
  end if;

  if p_etapa is null then
    raise exception 'etapa da revisão é obrigatória';
  end if;

  if p_prevista_em is null then
    raise exception 'data prevista da revisão é obrigatória';
  end if;

  select
    p.id,
    p.aluno_id,
    p.status,
    pd_origem.id,
    pd_revisada.id,
    (aula_origem.ativo and pd_origem.ativo),
    (aula_revisada.ativo and pd_revisada.ativo)
  into
    v_planejamento_id,
    v_aluno_id,
    v_planejamento_status,
    v_disciplina_origem_id,
    v_disciplina_revisada_id,
    v_origem_ativa,
    v_revisada_ativa
  from public.planejamento_aulas aula_origem
  join public.planejamento_disciplinas pd_origem
    on pd_origem.id = aula_origem.planejamento_disciplina_id
  join public.planejamentos p
    on p.id = pd_origem.planejamento_id
  join public.planejamento_aulas aula_revisada
    on aula_revisada.id = p_planejamento_aula_revisada_id
  join public.planejamento_disciplinas pd_revisada
    on pd_revisada.id = aula_revisada.planejamento_disciplina_id
   and pd_revisada.planejamento_id = p.id
  where aula_origem.id = p_planejamento_aula_origem_id
    and aula_origem.deleted_at is null
    and aula_revisada.deleted_at is null
    and pd_origem.deleted_at is null
    and pd_revisada.deleted_at is null
    and p.deleted_at is null;

  if v_planejamento_id is null then
    raise exception 'aulas da revisão não foram encontradas no mesmo planejamento vigente';
  end if;

  if v_disciplina_origem_id is distinct from v_disciplina_revisada_id then
    raise exception 'aulas da revisão devem pertencer à mesma disciplina';
  end if;

  if not coalesce(v_origem_ativa, false)
     or not coalesce(v_revisada_ativa, false) then
    raise exception 'somente aulas e disciplinas ativas podem receber nova revisão';
  end if;

  if v_planejamento_status = 'arquivado' then
    raise exception 'planejamento arquivado não pode receber nova revisão';
  end if;

  if not (
    public.professor_tem_aluno(v_aluno_id)
    or public.eh_admin()
  ) then
    raise exception 'sem permissão para criar revisão' using errcode = '42501';
  end if;

  perform set_config('app.audit_reason', 'criação manual de revisão pelo professor', true);

  insert into public.revisoes (
    planejamento_aula_origem_id,
    planejamento_aula_revisada_id,
    aluno_id,
    etapa,
    status,
    prevista_em
  ) values (
    p_planejamento_aula_origem_id,
    p_planejamento_aula_revisada_id,
    v_aluno_id,
    p_etapa,
    'pendente',
    p_prevista_em
  )
  returning * into v_revisao;

  return v_revisao;
end;
$$;

comment on function public.criar_revisao(uuid, uuid, public.etapa_revisao, date)
is 'Cria uma revisão pendente para o aluno derivado do planejamento, por professor vinculado ou administrador.';

revoke all on function public.criar_revisao(uuid, uuid, public.etapa_revisao, date)
from public, anon, authenticated;

grant execute on function public.criar_revisao(uuid, uuid, public.etapa_revisao, date)
to authenticated;

commit;
