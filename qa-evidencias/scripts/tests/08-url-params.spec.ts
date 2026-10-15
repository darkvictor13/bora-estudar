/** Parâmetros de URL malformados: a tela deve ignorar ou explicar, não cair no boundary. */
import { go, test } from "../qa.ts";

const STUDENT = ["/aluno?semana=abc", "/aluno?dia=xyz", "/aluno/flashcards?aula=nao-e-uuid", "/aluno/flashcards?deck=nao-existe", "/aluno/flashcards?meuDeck=nao-e-uuid", "/aluno/resumos-flash?aula=nao-e-uuid", "/aluno/simulados?simulado=nao-e-uuid", "/aluno/leis?lei=nao-existe"];
const TEACHER = ["/professor?turma=nao-e-uuid", "/professor?ritmo=xyz", "/professor/cadernos?plano=nao-e-uuid", "/professor/revisoes?plano=nao-e-uuid", "/professor/metas?plano=nao-e-uuid", "/professor/teoria?catalogo=nao-e-uuid", "/professor/estatisticas?plano=nao-e-uuid", "/professor/estatisticas?turma=nao-e-uuid", "/professor/simulados?simulado=nao-e-uuid", "/professor/alunos/nao-e-uuid"];

for (const [role, routes] of [["aluno", STUDENT], ["professor", TEACHER]] as const) {
  test(`F25.1 parâmetros malformados (${role})`, async ({ page, scenario, signIn, shot, finding }) => {
    await signIn(role === "aluno" ? scenario.student : scenario.teacher);
    for (const route of routes) {
      await go(page, route);
      const h1 = await page.locator("h1").allTextContents();
      if (h1.some((h) => /Algo deu errado/.test(h))) {
        const body = ((await page.locator("main").textContent()) ?? "").slice(0, 220);
        await shot(page, `F25.1 ${route}`);
        finding({ severity: "Baixo", title: `${route} cai em "Algo deu errado"`, detail: body });
      }
    }
  });
}
