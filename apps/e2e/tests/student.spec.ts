/**
 * O catálogo de `docs/fluxos-e2e.md` — telas do aluno.
 *
 * ESTE ARQUIVO FOI ESVAZIADO NAS FASES 3 A 5, e o que sobrou é o mapa. Todas as
 * telas que ele cobria foram reescritas a partir da v2, e a regra do plano é
 * converter o teste NA FASE EM QUE A TELA É REESCRITA — nunca antes, nunca
 * depois. Converter cedo deixa a suíte testando o que vai sumir; converter
 * tarde deixa a fase sem rede.
 *
 * Onde cada fluxo foi parar:
 *
 * | Era                         | Agora                                    |
 * |-----------------------------|------------------------------------------|
 * | F-ALU-01 (telas renderizam) | abaixo, contra a lista de rotas atual    |
 * | F-ALU-02 (seletor de semana)| `student-week.spec.ts` · F-META-02       |
 * | F-ALU-04 (meus dados)       | `student-analysis.spec.ts` · F-CONTA-01  |
 * | F-ALU-05 (lista de espera)  | `student-analysis.spec.ts` · F-ESP-01    |
 * | F-ALU-06 (sem planejamento) | `student-week.spec.ts` · F-META-06/07    |
 * | F-CONC-* (concluir meta)    | `student-week.spec.ts` · F-META-03/04    |
 * | F-EXTRA-* (estudo extra)    | `student-week.spec.ts` · F-EXTRA-01      |
 * | F-REVE-* (revisão espaçada) | `student-analysis.spec.ts` · F-REV-01    |
 * | F-TEMP-* (tempo e série)    | `student-analysis.spec.ts` · F-EST-01    |
 * | F-UI-01/02/03 (sidebar)     | `shell.spec.ts`                          |
 * | F-ALU-03, F-LIVR-* (cadernos)| `student-analysis.spec.ts` · F-CAD-01   |
 * | (novo) fluxo da teoria      | `student-theory.spec.ts` · F-TEO-01 a 07 |
 *
 * O QUE NÃO FOI CONVERTIDO, E POR QUÊ — são os fluxos que dependem do motor de
 * baterias, que saiu com a extensão e ainda não voltou. `quiz_sessions` e o
 * ledger são SELECT e nada mais; as RPCs (`start_quiz_session`,
 * `finish_quiz_session`, `record_reinforcement`) não foram portadas para o
 * schema de 14/09/2026:
 *
 * - **F-BAT-\*** — execução de bateria;
 * - **F-RCIC-\*** — reforço de ciclo, que nasce de desempenho baixo numa bateria;
 * - **F-RESU-\*** — resumo da bateria concluída e tópicos do bloco;
 * - **F-DIFI-04** — dificuldades por tópico, que lê o ledger;
 * - **F-CUP-\*** — cupom, que precisa nascer como RPC (`coupons` está sem
 *   policy e sem grant, de propósito).
 *
 * Eles voltam junto com o motor. O histórico deles está em
 * `git show 8569f1a:apps/e2e/tests/student.spec.ts`.
 */
import { expect, test } from "../fixtures/index.ts";
import { PAGE_TITLES, STUDENT_ROUTES } from "../support/routes.ts";

test.describe("F-ALU-01 · todas as telas do aluno abrem", () => {
  for (const route of STUDENT_ROUTES) {
    test(`${route} abre sem erro de console`, async ({ studentPage, consoleErrors }) => {
      await studentPage.goto(route);

      await expect(studentPage.locator("h1")).toHaveText(PAGE_TITLES[route]!);
      expect(consoleErrors).toEqual([]);
    });
  }
});
