import assert from "node:assert/strict";
import test from "node:test";

import { adminArea, professorArea, resolveRoute, studentArea, studentNavigationForAcademicAccess } from "./registry.ts";
import { canStudentAccessPath, professorStudentIdForPath, roleForPath, safeReturnPath } from "../auth/policies.ts";

test("declara todas as rotas solicitadas por área", () => {
  assert.equal(studentArea.routes.length, 14);
  assert.equal(professorArea.routes.length, 18);
  assert.equal(adminArea.routes.length, 17);
});

test("resolve parâmetros de uma rota profunda do professor", () => {
  const route = resolveRoute(professorArea, [
    "alunos", "aluno-123", "planejamentos", "plano-456", "metas", "gerar",
  ]);

  assert.equal(route?.pattern, "alunos/:alunoId/planejamentos/:planejamentoId/metas/gerar");
  assert.deepEqual(route?.params, { alunoId: "aluno-123", planejamentoId: "plano-456" });
});

test("não transforma caminhos desconhecidos em páginas válidas", () => {
  assert.equal(resolveRoute(studentArea, ["configuracoes"]), null);
  assert.equal(resolveRoute(adminArea, ["catalogo", "cupons"]), null);
});

test("identifica o perfil exigido pelo prefixo", () => {
  assert.equal(roleForPath("/aluno/metas"), "aluno");
  assert.equal(roleForPath("/professor/alunos/123/resumo"), "professor");
  assert.equal(roleForPath("/admin/catalogo/cursos"), "admin");
  assert.equal(roleForPath("/entrar"), null);
});

test("aluno sem acesso mantém somente as rotas permitidas", () => {
  assert.equal(canStudentAccessPath("/aluno/acesso", "bloqueado"), true);
  assert.equal(canStudentAccessPath("/aluno/perfil", "expirado"), true);
  assert.equal(canStudentAccessPath("/aluno/lista-de-espera", "pendente"), true);
  assert.equal(canStudentAccessPath("/aluno/metas", "bloqueado"), false);
  assert.equal(canStudentAccessPath("/aluno/metas", "ativo"), true);
});

test("oculta a lista de espera da navegação do aluno com acesso ativo", () => {
  const waitlistPath = "/aluno/lista-de-espera";

  assert.equal(studentNavigationForAcademicAccess(true).some((item) => item.href === waitlistPath), false);
  assert.equal(studentNavigationForAcademicAccess(false).some((item) => item.href === waitlistPath), true);
});

test("preserva somente destinos de retorno locais", () => {
  assert.equal(safeReturnPath("/aluno/metas", "?semana=2026-W29"), "/aluno/metas?semana=2026-W29");
  assert.equal(safeReturnPath("//exemplo.com", ""), "/");
});

test("extrai o aluno do contexto profundo do professor", () => {
  assert.equal(professorStudentIdForPath("/professor/alunos/aluno-1/resumo"), "aluno-1");
  assert.equal(professorStudentIdForPath("/professor/alunos"), null);
});
