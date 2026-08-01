import type { AppArea, ResolvedRoute, RouteDefinition } from "./types";

const route = (
  pattern: string,
  title: string,
  description: string,
  emptyTitle = "Nenhum dado disponível",
  emptyDescription = "Esta página está pronta para receber dados quando a integração for implementada.",
): RouteDefinition => ({ pattern, title, description, emptyTitle, emptyDescription });

export const studentArea: AppArea = {
  role: "aluno",
  label: "Área do aluno",
  navigation: [
    ["/aluno/inicio", "Início"], ["/aluno/metas", "Metas"],
    ["/aluno/disciplinas", "Disciplinas"], ["/aluno/aulas", "Aulas"],
    ["/aluno/planejamento", "Planejamento"], ["/aluno/reforcos", "Reforços"],
    ["/aluno/revisoes", "Revisões"], ["/aluno/desempenho", "Desempenho"],
    ["/aluno/acesso", "Acesso"], ["/aluno/lista-de-espera", "Lista de espera"],
    ["/aluno/perfil", "Perfil"],
  ].map(([href, label]) => ({ href, label })),
  routes: [
    route("inicio", "Início", "Resumo da semana, próximas metas, reforços e progresso.", "Sua semana ainda não começou", "As próximas atividades aparecerão aqui quando houver um planejamento ativo."),
    route("metas", "Metas", "Agenda semanal de metas do planejamento ativo.", "Nenhuma meta nesta semana", "Use o filtro de semana para consultar outro período."),
    route("metas/:metaId", "Detalhes da meta", "Conteúdo, agenda e situação da meta selecionada.", "Meta sem dados", "O conteúdo desta meta ainda não foi carregado."),
    route("disciplinas", "Disciplinas", "Disciplinas configuradas no planejamento ativo."),
    route("disciplinas/:disciplinaId", "Detalhes da disciplina", "Progresso, cadernos e aulas da disciplina selecionada."),
    route("aulas", "Aulas", "Relação de aulas disponíveis no planejamento ativo."),
    route("aulas/:aulaId", "Detalhes da aula", "Conteúdo, materiais e progresso da aula selecionada."),
    route("planejamento", "Planejamento", "Consulta à configuração congelada do planejamento ativo."),
    route("reforcos", "Reforços", "Sugestões de reforço e reforços já agendados."),
    route("revisoes", "Revisões", "Revisões pendentes e concluídas."),
    route("desempenho", "Desempenho", "Aproveitamento, questões, tempo de estudo e sequência.", "Planejado para a próxima etapa", "Os indicadores de desempenho serão implementados separadamente."),
    route("acesso", "Acesso", "Situação e validade do acesso acadêmico.", "Situação não carregada", "A integração exibirá aqui se o acesso está pendente, ativo, bloqueado, expirado ou cancelado."),
    route("lista-de-espera", "Lista de espera", "Gerenciamento do registro do aluno na lista de espera."),
    route("perfil", "Perfil", "Dados pessoais e fuso horário da conta."),
  ],
};

export function studentNavigationForAcademicAccess(isActive: boolean) {
  return isActive
    ? studentArea.navigation.filter((item) => item.href !== "/aluno/lista-de-espera")
    : studentArea.navigation;
}

export const professorArea: AppArea = {
  role: "professor",
  label: "Área do professor",
  navigation: [
    { href: "/professor/inicio", label: "Início", exact: true },
    { href: "/professor/alunos", label: "Alunos", exact: true },
    { href: "/professor/lista-de-espera", label: "Lista de espera", exact: true },
    { href: "/professor/perfil", label: "Perfil", exact: true },
  ],
  routes: [
    route("inicio", "Início", "Visão geral do acompanhamento dos alunos."),
    route("alunos", "Alunos", "Alunos que possuem vínculo ativo com o professor.", "Nenhum aluno vinculado", "Alunos com vínculo ativo aparecerão aqui."),
    route("lista-de-espera", "Lista de espera", "Acompanhamento dos alunos que aguardam contato."),
    route("perfil", "Perfil", "Dados pessoais e preferências do professor."),
    route("alunos/:alunoId/resumo", "Resumo do aluno", "Visão consolidada do aluno selecionado."),
    route("alunos/:alunoId/acesso", "Acesso do aluno", "Situação e validade do acesso acadêmico do aluno."),
    route("alunos/:alunoId/desempenho", "Desempenho do aluno", "Aproveitamento, questões, tempo e sequência do aluno.", "Planejado para a próxima etapa", "Os indicadores de desempenho serão implementados separadamente."),
    route("alunos/:alunoId/planejamentos", "Planejamentos", "Histórico e situação dos planejamentos do aluno."),
    route("alunos/:alunoId/planejamentos/novo", "Novo planejamento", "Criação de um planejamento com cópia protegida do catálogo acadêmico."),
    route("alunos/:alunoId/planejamentos/:planejamentoId/resumo", "Resumo do planejamento", "Visão geral da configuração e execução do planejamento."),
    route("alunos/:alunoId/planejamentos/:planejamentoId/disciplinas", "Disciplinas do planejamento", "Configurações de disciplinas copiadas para o planejamento."),
    route("alunos/:alunoId/planejamentos/:planejamentoId/cadernos", "Cadernos do planejamento", "Cadernos próprios e copiados para o planejamento."),
    route("alunos/:alunoId/planejamentos/:planejamentoId/aulas", "Aulas do planejamento", "Aulas configuradas para o planejamento."),
    route("alunos/:alunoId/planejamentos/:planejamentoId/metas", "Metas do planejamento", "Agenda de metas do planejamento selecionado."),
    route("alunos/:alunoId/planejamentos/:planejamentoId/metas/gerar", "Gerar metas", "Distribuição e substituição transacional das metas da semana."),
    route("alunos/:alunoId/planejamentos/:planejamentoId/reforcos", "Reforços do planejamento", "Reforços sugeridos e agendados no planejamento."),
    route("alunos/:alunoId/planejamentos/:planejamentoId/revisoes", "Revisões do planejamento", "Configuração e acompanhamento das revisões."),
    route("alunos/:alunoId/planejamentos/:planejamentoId/desempenho", "Desempenho do planejamento", "Indicadores acadêmicos do planejamento selecionado.", "Planejado para a próxima etapa", "Os indicadores de desempenho serão implementados separadamente."),
  ],
};

export const adminArea: AppArea = {
  role: "admin",
  label: "Administração",
  navigation: [
    ["/admin/inicio", "Início"], ["/admin/usuarios", "Usuários"],
    ["/admin/vinculos", "Vínculos"], ["/admin/acessos", "Acessos"],
    ["/admin/catalogo/cursos", "Cursos"], ["/admin/catalogo/disciplinas", "Disciplinas"],
    ["/admin/lista-de-espera", "Lista de espera"], ["/admin/auditoria", "Auditoria"],
    ["/admin/perfil", "Perfil"],
  ].map(([href, label]) => ({ href, label })),
  routes: [
    route("inicio", "Início", "Visão geral da operação administrativa."),
    route("usuarios", "Usuários", "Gerenciamento de usuários e perfis."),
    route("usuarios/:usuarioId", "Detalhes do usuário", "Perfil, situação e permissões do usuário selecionado."),
    route("vinculos", "Vínculos", "Relações entre professores e alunos."),
    route("vinculos/:vinculoId", "Detalhes do vínculo", "Situação e histórico do vínculo selecionado."),
    route("acessos", "Acessos", "Acompanhamento das liberações de acesso acadêmico."),
    route("catalogo/cursos", "Cursos", "Cursos do catálogo acadêmico global."),
    route("catalogo/cursos/novo", "Novo curso", "Cadastro completo de um curso do catálogo acadêmico."),
    route("catalogo/cursos/:cursoId/resumo", "Resumo do curso", "Configuração geral do curso selecionado."),
    route("catalogo/cursos/:cursoId/disciplinas", "Disciplinas do curso", "Disciplinas vinculadas ao curso do catálogo."),
    route("catalogo/cursos/:cursoId/cadernos", "Cadernos do curso", "Cadernos globais configurados para o curso."),
    route("catalogo/cursos/:cursoId/aulas", "Aulas do curso", "Aulas e materiais do curso no catálogo."),
    route("catalogo/disciplinas", "Disciplinas", "Disciplinas do catálogo acadêmico global."),
    route("catalogo/disciplinas/:disciplinaId", "Detalhes da disciplina", "Configuração da disciplina global selecionada."),
    route("lista-de-espera", "Lista de espera", "Visão administrativa dos registros da lista de espera."),
    route("auditoria", "Auditoria", "Registro das operações administrativas auditáveis."),
    route("perfil", "Perfil", "Dados pessoais e preferências do administrador."),
  ],
};

export const areas = { aluno: studentArea, professor: professorArea, admin: adminArea } as const;

export function resolveRoute(area: AppArea, segments: string[]): ResolvedRoute | null {
  const pathname = segments.join("/");

  for (const definition of area.routes) {
    const patternSegments = definition.pattern.split("/");
    if (patternSegments.length !== segments.length) continue;

    const params: Record<string, string> = {};
    const matches = patternSegments.every((part, index) => {
      if (part.startsWith(":")) {
        params[part.slice(1)] = segments[index];
        return Boolean(segments[index]);
      }
      return part === segments[index];
    });

    if (matches) return { ...definition, pathname, params };
  }

  return null;
}
