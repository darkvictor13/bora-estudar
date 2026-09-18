/**
 * O catálogo de `docs/fluxos-e2e.md` — telas do professor.
 *
 * REESCRITO NA FASE 6, e não convertido: as telas mudaram de forma junto com o
 * schema. A ficha do aluno era um modal e virou rota; gerar metas ganhou prévia
 * obrigatória; e três ações da v2 saíram porque o banco não as permitia.
 *
 * DUAS DELAS VOLTARAM EM 18/09/2026, com a spec 13: vincular e liberar acesso.
 * Os três `test.fixme` que guardavam a falta deram lugar a `F-VINC-01` a
 * `F-VINC-08` e a `F-MATR-01` a `F-MATR-05` — as turmas entraram junto porque
 * `classes` e `class_students` já estavam no banco e nunca tinham ganhado tela.
 *
 * O QUE CONTINUA FALTANDO, e por quê: **anular bateria**. `quiz_sessions` é
 * SELECT e nada mais, e `void_quiz_session` não foi portada. A defesa do banco
 * é a certa, e afrouxá-la para a tela funcionar abriria o buraco que ela fecha;
 * o `fixme` no fim do arquivo mantém a falta visível na saída da suíte.
 */
import { randomUUID } from "node:crypto";

import type { Page } from "@playwright/test";

import { expect, test } from "../fixtures/index.ts";
import { asUser, count, one, query } from "../fixtures/db.ts";
import { addTheoryCatalog, addWeek, createUser, joinWaitlist } from "../fixtures/scenario.ts";
import { alert, content, field, testId } from "../support/ui.ts";
import { PAGE_TITLES, TEACHER_ROUTES } from "../support/routes.ts";

test.describe("F-PROF-01 · todas as telas do professor abrem", () => {
  for (const route of TEACHER_ROUTES) {
    test(`${route} abre sem erro de console`, async ({ teacherPage, consoleErrors }) => {
      await teacherPage.goto(route);

      await expect(teacherPage.locator("h1")).toHaveText(PAGE_TITLES[route]!);
      expect(consoleErrors).toEqual([]);
    });
  }
});

test.describe("F-PROF-02 · a lista de alunos", () => {
  test("abre pelos atrasados, e os filtros somam", async ({ teacherPage, scenario }) => {
    await teacherPage.goto("/professor");

    const card = testId(teacherPage, "student-card");
    await expect(card).toHaveCount(1);
    await expect(card).toContainText(scenario.student.name);
    await expect(card).toContainText(scenario.planName);

    // O cenário tem 5 metas na semana 1, nenhuma concluída: se alguma já era
    // devida, o aluno está atrasado; se nenhuma era, está em ritmo. Os dois são
    // válidos — o que não pode é a classificação sumir.
    await expect(card).toHaveAttribute("data-pace", /behind|attention|on_track/);
  });

  test("a busca por nome recorta a lista", async ({ teacherPage, scenario }) => {
    await teacherPage.goto("/professor");
    await expect(testId(teacherPage, "student-card")).toHaveCount(1);

    await teacherPage.locator('[data-testid="student-search"]').fill("Ninguém Com Este Nome");
    await expect(testId(teacherPage, "student-card")).toHaveCount(0);
    await expect(testId(teacherPage, "empty")).toContainText("Nenhum aluno com esse recorte");

    await teacherPage.locator('[data-testid="student-search"]').fill(scenario.student.name.slice(0, 5));
    await expect(testId(teacherPage, "student-card")).toHaveCount(1);
  });

  test("o recorte fica na URL, e sobrevive ao recarregar", async ({ teacherPage }) => {
    await teacherPage.goto("/professor?ritmo=behind");
    await expect(teacherPage).toHaveURL(/ritmo=behind/);

    await teacherPage.reload();
    await expect(teacherPage.locator('[data-testid="pace-filter"]')).toHaveValue("behind");
  });
});

test.describe("F-PROF-03 · a ficha do aluno", () => {
  test("é uma ROTA, com endereço próprio", async ({ teacherPage, scenario }) => {
    await teacherPage.goto("/professor");
    await testId(teacherPage, "student-card").click();

    await expect(teacherPage).toHaveURL(new RegExp(`/professor/alunos/${scenario.student.id}$`));
    await expect(teacherPage.locator("h1")).toHaveText(scenario.student.name);

    // Virar rota resolve o que o modal não tinha: endereço para mandar a
    // alguém, botão voltar, e título de aba dizendo de quem é a ficha.
    await teacherPage.goBack();
    await expect(teacherPage).toHaveURL(/\/professor$/);
  });

  test("o aluno de outro professor não existe para este", async ({ teacherPage }) => {
    // A RLS já o esconde; a tela precisa dizer "não existe para você" em vez de
    // mostrar uma ficha vazia que parece um defeito.
    await teacherPage.goto("/professor/alunos/11111111-1111-4111-8111-999999999999");
    await expect(content(teacherPage)).toContainText("Aluno não encontrado");
  });

  test("oferece o que o banco cumpre, e diz o que ainda falta", async ({
    teacherPage,
    scenario,
  }) => {
    await teacherPage.goto(`/professor/alunos/${scenario.student.id}`);

    // Liberar e bloquear existem desde que `set_student_access` nasceu; a
    // turma, desde que `class_students` ganhou tela.
    await expect(testId(teacherPage, "access-form")).toBeVisible();
    await expect(testId(teacherPage, "grant-access")).toBeVisible();

    // O que continua sem caminho diz o motivo em vez de oferecer e falhar: um
    // botão que sempre colhe `42501` é pior do que botão nenhum.
    await expect(testId(teacherPage, "topic-difficulties-empty")).toContainText("catálogo de tópicos");
    await expect(content(teacherPage).getByRole("button", { name: /Anular/ })).toHaveCount(0);
  });
});

test.describe("F-PROF-04 · gerar metas: a prévia vem antes da escrita", () => {
  test.use({ scenarioOptions: { withGoals: false } });

  test("a prévia não grava nada", async ({ teacherPage, scenario }) => {
    await teacherPage.goto("/professor/metas");

    await testId(teacherPage, "goals-preview").click();
    await expect(testId(teacherPage, "week-preview")).toBeVisible();

    // Gerar semana é a operação mais cara de desfazer do produto. A prévia
    // mostra o que ACONTECERIA, e o banco continua como estava.
    expect(
      await count("select count(*) from public.goals where study_plan_id = $1", [scenario.planId]),
    ).toBe(0);
  });

  test("gerar cria a semana, distribuída pelos dias", async ({ teacherPage, scenario }) => {
    await teacherPage.goto("/professor/metas");

    await testId(teacherPage, "goals-preview").click();
    await expect(testId(teacherPage, "week-preview")).toBeVisible();
    await testId(teacherPage, "goals-generate").click();

    await expect(alert(teacherPage, "success")).toContainText("Semana 1 gerada");

    const criadas = await count(
      "select count(*) from public.goals where study_plan_id = $1 and week_number = 1",
      [scenario.planId],
    );
    expect(criadas).toBeGreaterThan(0);

    // Espalhada, e não empilhada num dia só: o modelo de avanço progressivo
    // pressupõe estudo distribuído, e quatro matérias numa segunda produz uma
    // semana que ninguém cumpre.
    const dias = await count(
      "select count(distinct weekday) from public.goals where study_plan_id = $1 and week_number = 1",
      [scenario.planId],
    );
    expect(dias).toBeGreaterThan(1);
  });
});

test.describe("F-PROF-05 · a substituição segura", () => {
  test("o modo seguro preserva a meta CONCLUÍDA e os registros dela", async ({
    teacherPage,
    scenario,
  }) => {
    const concluida = scenario.goals[0]!;
    await query("update public.goals set status = 'completed', completed_at = now() where id = $1", [
      concluida.id,
    ]);
    await query(
      `insert into public.goal_entries (goal_id, student_id, teacher_id, minutes, questions, correct_answers)
       values ($1, $2, $3, 50, 10, 8)`,
      [concluida.id, scenario.student.id, scenario.teacher.id],
    );

    await teacherPage.goto("/professor/metas");
    await testId(teacherPage, "goals-preview").click();

    await expect(testId(teacherPage, "week-preview")).toContainText("Preservadas");
    await testId(teacherPage, "goals-generate").click();
    await expect(alert(teacherPage, "success")).toBeVisible();

    // A meta concluída continua de pé, com o registro. É a regra do LEIA-ME
    // v108.3, e o banco NÃO a garante — o adaptador é o único guardião.
    const sobreviveu = await one<{ status: string }>(
      "select status::text from public.goals where id = $1",
      [concluida.id],
    );
    expect(sobreviveu.status).toBe("completed");
    expect(
      await count("select count(*) from public.goal_entries where goal_id = $1", [concluida.id]),
    ).toBe(1);
  });

  test("replanejar a semana inteira EXIGE confirmação, e aí apaga", async ({
    teacherPage,
    scenario,
  }) => {
    const concluida = scenario.goals[0]!;
    await query("update public.goals set status = 'completed', completed_at = now() where id = $1", [
      concluida.id,
    ]);

    await teacherPage.goto("/professor/metas");
    await teacherPage.getByRole("combobox", { name: "Substituição" }).click();
    await teacherPage.getByRole("option", { name: /Replanejar semana inteira/ }).click();

    // O aviso aparece ANTES da prévia: o professor precisa saber o que este
    // caminho destrói antes de montar a prévia dele.
    await expect(alert(teacherPage, "warning")).toContainText("apaga também as metas concluídas");

    await testId(teacherPage, "goals-preview").click();
    await expect(testId(teacherPage, "week-preview")).toBeVisible();

    // Um clique único aqui seria a forma mais rápida de o aluno perder uma
    // semana de estudo: o botão pede confirmação primeiro.
    await testId(teacherPage, "goals-confirm").click();
    await testId(teacherPage, "goals-generate").click();
    await expect(alert(teacherPage, "success")).toBeVisible();

    expect(
      await count("select count(*) from public.goals where id = $1", [concluida.id]),
    ).toBe(0);
  });
});

test.describe("F-PROF-06 · copiar a semana anterior", () => {
  test("copia o PLANO, nunca o resultado", async ({ teacherPage, scenario }) => {
    await addWeek(scenario, 2);
    // A semana 1 tem uma meta concluída, com registro.
    await query("update public.goals set status = 'completed' where id = $1", [
      scenario.goals[0]!.id,
    ]);

    await teacherPage.goto("/professor/metas?semana=3");
    await testId(teacherPage, "goals-copy-from").fill("1");
    await testId(teacherPage, "goals-preview").click();
    await expect(testId(teacherPage, "week-preview")).toBeVisible();
    await testId(teacherPage, "goals-generate").click();
    await expect(alert(teacherPage, "success")).toBeVisible();

    // Copiar o resultado daria ao aluno uma semana que já nasce metade
    // concluída.
    const naSemana3 = await count(
      `select count(*) from public.goals
        where study_plan_id = $1 and week_number = 3 and status <> 'pending'`,
      [scenario.planId],
    );
    expect(naSemana3).toBe(0);
  });
});

test.describe("F-GPLAN-01 · planejamentos", () => {
  test("nasce PAUSADO, e ativar arquiva o anterior", async ({ teacherPage, scenario }) => {
    // NOME ÚNICO POR CENÁRIO. Um literal compartilhado faz dois workers
    // criarem linhas com o mesmo nome, e a consulta de conferência lê a do
    // vizinho — que já foi ativada.
    const nome = `Segundo Plano ${scenario.planId.slice(0, 8)}`;

    await teacherPage.goto("/professor/planejamentos");

    await teacherPage.getByRole("button", { name: "Novo planejamento" }).click();
    await field(teacherPage, "name").fill(nome);
    await testId(teacherPage, "plan-dialog").getByRole("button", { name: "Criar" }).click();
    // ESPERA O MODAL FECHAR antes de ler o banco: a gravação é assíncrona, e
    // consultar no instante do clique lê o estado anterior.
    await expect(testId(teacherPage, "plan-dialog")).toHaveCount(0);

    // Nascer ativo trocaria o planejamento do aluno no instante em que o
    // professor clicasse "salvar", antes de ele conferir.
    const novo = await one<{ id: string; status: string }>(
      "select id, status::text from public.study_plans where name = $1",
      [nome],
    );
    expect(novo.status).toBe("paused");

    await teacherPage
      .locator(`[data-testid="plan-row"][data-plan-id="${novo.id}"]`)
      .getByTestId("plan-activate")
      .click();

    await expect(
      teacherPage.locator(`[data-testid="plan-row"][data-plan-id="${novo.id}"]`),
    ).toHaveAttribute("data-status", "active");

    // Um ativo por aluno: o anterior foi arquivado, e não duplicado.
    const anterior = await one<{ status: string }>(
      "select status::text from public.study_plans where id = $1",
      [scenario.planId],
    );
    expect(anterior.status).toBe("archived");
    expect(
      await count(
        "select count(*) from public.study_plans where student_id = $1 and status = 'active'",
        [scenario.student.id],
      ),
    ).toBe(1);
  });

  test("nome vazio é recusado, com o campo marcado", async ({ teacherPage }) => {
    await teacherPage.goto("/professor/planejamentos");
    await teacherPage.getByRole("button", { name: "Novo planejamento" }).click();

    await field(teacherPage, "name").fill("Jo");
    await testId(teacherPage, "plan-dialog").getByRole("button", { name: "Criar" }).click();

    // Escopado no modal: o erro aparece nos dois lugares — na tela e no
    // formulário — e o modo estrito recusa dois casamentos.
    await expect(alert(testId(teacherPage, "plan-dialog"), "error")).toContainText(
      "Dê um nome ao planejamento",
    );
  });

  /*
   * `teacherPage` e `studentPage` SÃO A MESMA ABA — os dois derivam do `page`
   * embutido, e pedir os dois na assinatura faz o segundo login sobrescrever o
   * primeiro em silêncio. Quem precisa dos dois papéis troca de identidade com
   * `signIn`, na ordem em que o teste quer.
   */
  test("arquivar tira da vista do aluno", async ({ teacherPage, signIn, scenario }) => {
    await teacherPage.goto("/professor/planejamentos");
    await teacherPage
      .locator(`[data-testid="plan-row"][data-plan-id="${scenario.planId}"]`)
      .getByTestId("plan-archive")
      .click();

    await expect(
      teacherPage.locator(`[data-testid="plan-row"][data-plan-id="${scenario.planId}"]`),
    ).toHaveAttribute("data-status", "archived");

    await signIn(scenario.student);
    await teacherPage.goto("/aluno");
    await expect(alert(teacherPage, "info")).toContainText("Nenhum planejamento ativo");
  });
});

test.describe("F-CAD-01 · cadernos TEC", () => {
  test("desativar tira do aluno sem sumir do professor", async ({
    teacherPage,
    signIn,
    scenario,
  }) => {
    await teacherPage.goto("/professor/cadernos");

    const linha = teacherPage.locator(
      `[data-testid="notebook-row"][data-block-id="${scenario.blocks[0]!.id}"]`,
    );
    await linha.getByTestId("notebook-toggle").click();
    await expect(linha).toHaveAttribute("data-active", "false");

    // O aluno continua vendo, apagado: sumir faria ele procurar o que o
    // professor tirou do ar de propósito.
    await signIn(scenario.student);
    await teacherPage.goto("/aluno/cadernos");
    await expect(
      teacherPage.locator(`[data-testid="notebook-row"][data-block-id="${scenario.blocks[0]!.id}"]`),
    ).toContainText("desativado pelo professor");
  });

  test("remover é MARCAR, e restaurar traz de volta", async ({ teacherPage, scenario }) => {
    const blockId = scenario.blocks[0]!.id;
    await teacherPage.goto("/professor/cadernos");

    await teacherPage
      .locator(`[data-testid="notebook-row"][data-block-id="${blockId}"]`)
      .getByTestId("notebook-remove")
      .click();

    // A linha some da lista padrão…
    await expect(
      teacherPage.locator(`[data-testid="notebook-row"][data-block-id="${blockId}"]`),
    ).toHaveCount(0);

    // …e a linha continua no banco. Apagar levaria junto o histórico: a meta de
    // bateria aponta para o caderno com `ON DELETE RESTRICT`.
    const marcado = await one<{ deleted: boolean }>(
      "select deleted from public.study_plan_notebooks where block_id = $1",
      [blockId],
    );
    expect(marcado.deleted).toBe(true);

    await testId(teacherPage, "toggle-removed").click();
    await teacherPage
      .locator(`[data-testid="notebook-row"][data-block-id="${blockId}"]`)
      .getByTestId("notebook-restore")
      .click();

    await expect(
      teacherPage.locator(`[data-testid="notebook-row"][data-block-id="${blockId}"]`),
    ).toHaveAttribute("data-deleted", "false");
  });

  test("editar o nome vale para este planejamento", async ({ teacherPage, scenario }) => {
    const blockId = scenario.blocks[0]!.id;
    await teacherPage.goto("/professor/cadernos");

    const linha = teacherPage.locator(`[data-testid="notebook-row"][data-block-id="${blockId}"]`);
    await linha.getByRole("button", { name: "Editar" }).click();
    await field(teacherPage, "notebookName").fill("Caderno Renomeado E2E");
    await linha.getByRole("button", { name: "Salvar" }).click();

    await expect(linha).toContainText("Caderno Renomeado E2E");
  });
});

test.describe("F-TCAT-01 · catálogo de teoria", () => {
  test("as regras por disciplina salvam, com até cinco revisões", async ({
    teacherPage,
    scenario,
  }) => {
    const catalog = await addTheoryCatalog(scenario, { initialQuestions: 15, reviewSpacing: 2 });

    await teacherPage.goto("/professor/teoria");
    await expect(teacherPage.locator("h1")).toHaveText("Catálogo de teoria");

    const form = teacherPage.locator('[data-testid="subject-rule-form"][data-subject="ciencias forenses"]');
    await expect(form).toBeVisible();

    await form.locator("#field-initialQuestions").fill("25");
    await form.getByRole("button", { name: "Acrescentar revisão" }).click();
    await form.getByRole("button", { name: "Salvar regras" }).click();

    await expect(alert(teacherPage, "success")).toContainText("Regras de");

    const regra = await one<{ initial_questions: number }>(
      "select initial_questions from public.theory_catalog_subject_rules where catalog_id = $1",
      [catalog.id],
    );
    expect(regra.initial_questions).toBe(25);

    // A segunda revisão foi criada pela tela.
    expect(
      await count("select count(*) from public.theory_review_rules where catalog_id = $1", [
        catalog.id,
      ]),
    ).toBe(2);
  });

  test("a aula sem páginas auditadas é MARCADA, não escondida", async ({
    teacherPage,
    scenario,
  }) => {
    await addTheoryCatalog(scenario, { withUnaudited: true });

    await teacherPage.goto("/professor/teoria");

    // É o que o aluno vai ver como diagnóstico no lugar do controle por página:
    // o professor precisa saber disso antes dele.
    const semPagina = teacherPage.locator('[data-testid="lesson-row"][data-has-theory="false"]');
    await expect(semPagina).toHaveCount(1);
    await expect(semPagina).toContainText("sem páginas");
  });

  test("editar as páginas de uma aula grava", async ({ teacherPage, scenario }) => {
    const catalog = await addTheoryCatalog(scenario);
    const aula = catalog.lessons[0]!;

    await teacherPage.goto("/professor/teoria");
    const linha = teacherPage.locator(`[data-testid="lesson-row"][data-lesson-id="${aula.id}"]`);
    await linha.getByRole("button", { name: "Editar" }).click();
    // 20 cabe no PDF da aula 1 (37 páginas). Um valor MAIOR que o total é
    // recusado, e o teste abaixo cobre esse caminho.
    await field(teacherPage, "theoryEndPage").fill("20");
    await linha.getByRole("button", { name: "Salvar aula" }).click();

    await expect(alert(teacherPage, "success")).toContainText("salva");
    expect(
      (
        await one<{ theory_end_page: number }>(
          "select theory_end_page from public.theory_lessons where id = $1",
          [aula.id],
        )
      ).theory_end_page,
    ).toBe(20);
  });

  test("o fim da teoria além do total de páginas é recusado", async ({
    teacherPage,
    scenario,
  }) => {
    const catalog = await addTheoryCatalog(scenario);
    const aula = catalog.lessons[0]!;

    await teacherPage.goto("/professor/teoria");
    const linha = teacherPage.locator(`[data-testid="lesson-row"][data-lesson-id="${aula.id}"]`);
    await linha.getByRole("button", { name: "Editar" }).click();
    // O PDF da aula 1 tem 37 páginas. Aceitar 400 mandaria o aluno para uma
    // página que não existe, e ele acharia que a culpa é dele.
    await field(teacherPage, "theoryEndPage").fill("400");
    await linha.getByRole("button", { name: "Salvar aula" }).click();

    await expect(alert(teacherPage, "error")).toContainText("passa do total de páginas");
  });

  test("vincular o catálogo ao planejamento, um por planejamento", async ({
    teacherPage,
    scenario,
  }) => {
    const catalog = await addTheoryCatalog(scenario);
    // A fixture já vinculou; desvincular para o teste exercitar o botão.
    await query("delete from public.study_plan_theory_catalogs where study_plan_id = $1", [
      scenario.planId,
    ]);

    await teacherPage.goto("/professor/teoria");
    await teacherPage.getByRole("button", { name: "Vincular" }).click();

    await expect(alert(teacherPage, "success")).toContainText("Catálogo vinculado");
    const vinculo = await one<{ catalog_id: string }>(
      "select catalog_id from public.study_plan_theory_catalogs where study_plan_id = $1",
      [scenario.planId],
    );
    expect(vinculo.catalog_id).toBe(catalog.id);
  });
});

test.describe("F-TREV-01 · revisões do professor", () => {
  test("é aqui que o espaçamento se configura", async ({ teacherPage, signIn, scenario }) => {
    const catalog = await addTheoryCatalog(scenario, { reviewSpacing: 2 });

    await teacherPage.goto("/professor/revisoes");
    const form = teacherPage.locator('[data-testid="spacing-form"][data-subject="ciencias forenses"]');
    await form.locator("#field-lessonSpacing").fill("4");
    await form.getByRole("button", { name: "Salvar ritmo" }).click();

    await expect(alert(teacherPage, "success")).toContainText("Espaçamento de");

    const regra = await one<{ lesson_spacing: number }>(
      "select lesson_spacing from public.theory_review_rules where catalog_id = $1 and review_number = 1",
      [catalog.id],
    );
    expect(regra.lesson_spacing).toBe(4);

    // E o aluno vê o novo ritmo, sem poder mudá-lo.
    await signIn(scenario.student);
    await teacherPage.goto("/aluno/revisoes");
    await expect(content(teacherPage)).toContainText("Revisão a cada 4 aulas");
  });

  test("espaçamento fora da faixa é recusado", async ({ teacherPage, scenario }) => {
    await addTheoryCatalog(scenario);

    await teacherPage.goto("/professor/revisoes");
    const form = teacherPage.locator('[data-testid="spacing-form"]').first();
    await form.locator("#field-lessonSpacing").fill("0");
    await form.getByRole("button", { name: "Salvar ritmo" }).click();

    await expect(alert(teacherPage, "error")).toContainText("entre 1 e 200");
  });
});

test.describe("F-TEST-01 · estatísticas do professor", () => {
  test("são as mesmas do aluno, apontadas para o planejamento dele", async ({
    teacherPage,
    scenario,
  }) => {
    await query(
      `insert into public.goal_entries
         (goal_id, student_id, teacher_id, minutes, questions, correct_answers, created_at)
       values ($1, $2, $3, 60, 20, 15, now() - interval '2 days'),
              ($1, $2, $3, 30, 10, 9,  now())`,
      [scenario.goals[0]!.id, scenario.student.id, scenario.teacher.id],
    );

    await teacherPage.goto("/professor/estatisticas");
    await expect(teacherPage.locator("h1")).toHaveText("Estatísticas");

    // Duplicar os componentes para "a versão do professor" produziria duas
    // verdades sobre o mesmo número.
    await expect(content(teacherPage)).toContainText("80%");
    await expect(testId(teacherPage, "chart-minutes-day")).toBeVisible();
  });
});

test.describe("F-ANUL · anular bateria", () => {
  /*
   * `quiz_sessions` é SELECT e nada mais; a escrita é de RPC, e
   * `void_quiz_session` não foi portada. Sem o motor de baterias também não há
   * bateria para anular.
   */
  test.fixme("anular tira do desempenho sem sumir do histórico", async ({
    teacherPage,
    scenario,
  }) => {
    await teacherPage.goto(`/professor/alunos/${scenario.student.id}`);
    await testId(teacherPage, "quiz-session-row").first().getByRole("button", { name: "Anular" }).click();
    await expect(alert(teacherPage, "success")).toBeVisible();
  });
});

/* ------------------------------------------------------------------ *
 * Vínculo, acesso e turmas — spec 13
 * ------------------------------------------------------------------ */

test.describe("F-VINC · achar e assumir um aluno", () => {
  test("F-VINC-01 · a busca é pelo e-mail INTEIRO", async ({ teacherPage }) => {
    const candidato = await createUser("student", "Candidato Sem Professor", "cand");

    await teacherPage.goto("/professor");

    // Um pedaço do endereço não acha ninguém: casar parcial seria enumeração
    // com outro nome, e é por isso que a fila sem dono deixou de ser legível.
    await field(teacherPage, "email").fill(candidato.email.slice(0, 8));
    await testId(teacherPage, "find-student-submit").click();
    await expect(testId(teacherPage, "student-search-result")).toHaveCount(0);

    await field(teacherPage, "email").fill(candidato.email);
    await testId(teacherPage, "find-student-submit").click();

    const achado = testId(teacherPage, "student-search-result");
    await expect(achado).toHaveAttribute("data-student-id", candidato.id);
    await expect(achado).toContainText(candidato.name);
    await expect(achado).toHaveAttribute("data-has-teacher", "false");
  });

  test("F-VINC-02 · assumir vincula e reivindica a inscrição da fila", async ({
    teacherPage,
    scenario,
  }) => {
    const candidato = await createUser("student", "Candidato Da Fila", "cand");
    await joinWaitlist(candidato);

    await teacherPage.goto("/professor");
    await field(teacherPage, "email").fill(candidato.email);
    await testId(teacherPage, "find-student-submit").click();
    await testId(teacherPage, "link-student").click();

    // O cartão aparece na lista — e aparece AGUARDANDO: vincular diz de quem o
    // aluno é, liberar diz se ele entra. São dois atos.
    const cartao = teacherPage.locator(
      `[data-testid="student-card"][data-student-id="${candidato.id}"]`,
    );
    await expect(cartao).toBeVisible();
    await expect(cartao).toContainText("Aguardando");

    const perfil = await one<{ teacher_id: string; access_status: string }>(
      "select teacher_id, access_status::text from public.profiles where id = $1",
      [candidato.id],
    );
    expect(perfil.teacher_id).toBe(scenario.teacher.id);
    expect(perfil.access_status).toBe("pending");

    // E a linha da fila foi reivindicada no mesmo ato: sem isso a inscrição
    // ficaria sem dono para sempre, invisível para quem assumiu o aluno.
    const fila = await one<{ teacher_id: string }>(
      "select teacher_id from public.waitlist where student_id = $1",
      [candidato.id],
    );
    expect(fila.teacher_id).toBe(scenario.teacher.id);
  });

  test("F-VINC-03 · quem já tem professor é ENCONTRADO, e a tela não diz de quem", async ({
    teacherPage,
  }) => {
    const outro = await createUser("teacher", "Professor Vizinho", "prof");
    const aluno = await createUser("student", "Aluno Do Vizinho", "aluno");
    // Pré-condição pela RPC REAL: se a regra de vínculo regredir, o cenário
    // falha aqui em vez de fabricar um estado impossível.
    await asUser(outro.id, (client) => client.query("select public.link_student($1)", [aluno.id]));

    await teacherPage.goto("/professor");
    await field(teacherPage, "email").fill(aluno.email);
    await testId(teacherPage, "find-student-submit").click();

    const achado = testId(teacherPage, "student-search-result");
    await expect(achado).toHaveAttribute("data-has-teacher", "true");
    await expect(achado).toContainText("Já tem professor");
    // Responder "não existe" faria a tela mentir para quem digitou o e-mail
    // certo do próprio aluno; dizer QUEM é o professor daria um mapa de quem é
    // aluno de quem.
    await expect(achado).not.toContainText(outro.name);
    await expect(testId(teacherPage, "link-student")).toHaveCount(0);
  });

  test("F-VINC-04 · assumir duas vezes devolve o mesmo vínculo", async ({
    teacherPage,
    scenario,
  }) => {
    const candidato = await createUser("student", "Candidato Clicado Duas Vezes", "cand");

    await teacherPage.goto("/professor");
    await field(teacherPage, "email").fill(candidato.email);
    await testId(teacherPage, "find-student-submit").click();
    await testId(teacherPage, "link-student").click();

    await expect(
      teacherPage.locator(`[data-testid="student-card"][data-student-id="${candidato.id}"]`),
    ).toBeVisible();

    // O segundo "assumir" chega ao banco como um `update ... where teacher_id
    // is null` que não acha linha. Não é erro: o aluno já é seu.
    await field(teacherPage, "email").fill(candidato.email);
    await testId(teacherPage, "find-student-submit").click();
    await expect(testId(teacherPage, "student-search-result")).toHaveAttribute(
      "data-is-mine",
      "true",
    );
    await expect(alert(content(teacherPage), "error")).toHaveCount(0);

    expect(
      await count("select count(*) from public.profiles where teacher_id = $1", [
        scenario.teacher.id,
      ]),
    ).toBe(2);
  });
});

test.describe("F-VINC · liberar e bloquear", () => {
  test.use({ scenarioOptions: { access: "pending" } });

  test("F-VINC-05 · liberar abre as telas de estudo do aluno", async ({
    teacherPage,
    signIn,
    scenario,
  }) => {
    await teacherPage.goto(`/professor/alunos/${scenario.student.id}`);
    await testId(teacherPage, "grant-access").click();

    await expect(alert(teacherPage, "success")).toContainText("Acesso liberado");

    const perfil = await one<{ status: string; vence: string }>(
      `select access_status::text as status,
              to_char(access_expires_at, 'YYYY-MM-DD') as vence
         from public.profiles where id = $1`,
      [scenario.student.id],
    );
    expect(perfil.status).toBe("active");
    // Três meses é o padrão, o mesmo valor que a v96 passava como literal.
    const esperado = new Date();
    esperado.setMonth(esperado.getMonth() + 3);
    expect(perfil.vence).toBe(esperado.toISOString().slice(0, 10));

    // E o aluno deixa de ser mandado para a lista de espera.
    await signIn(scenario.student);
    await teacherPage.goto("/aluno");
    await expect(teacherPage).toHaveURL(/\/aluno$/);
    await expect(teacherPage.locator("h1")).toHaveText("Metas da semana");
  });

  test("F-VINC-06 · liberar de novo SOMA ao que ainda falta", async ({
    teacherPage,
    scenario,
  }) => {
    await teacherPage.goto(`/professor/alunos/${scenario.student.id}`);

    await teacherPage.getByRole("combobox", { name: "Vigência" }).click();
    await teacherPage.getByRole("option", { name: "1 mês" }).click();
    await testId(teacherPage, "grant-access").click();
    await expect(alert(teacherPage, "success")).toContainText("1 mês");

    const primeira = await one<{ vence: string }>(
      "select to_char(access_expires_at, 'YYYY-MM-DD') as vence from public.profiles where id = $1",
      [scenario.student.id],
    );

    await teacherPage.getByRole("combobox", { name: "Vigência" }).click();
    await teacherPage.getByRole("option", { name: "3 meses" }).click();
    await testId(teacherPage, "grant-access").click();
    await expect(alert(teacherPage, "success")).toContainText("3 meses");

    const segunda = await one<{ vence: string }>(
      "select to_char(access_expires_at, 'YYYY-MM-DD') as vence from public.profiles where id = $1",
      [scenario.student.id],
    );
    // Quem renova antes do fim não perde dia pago: quatro meses, não três.
    const esperado = new Date();
    esperado.setMonth(esperado.getMonth() + 4);
    expect(segunda.vence).toBe(esperado.toISOString().slice(0, 10));
    expect(segunda.vence > primeira.vence).toBe(true);

    // Duas liberações, duas linhas no histórico: é ele que responde "desde
    // quando este aluno tem acesso".
    expect(
      await count("select count(*) from public.access_grants where student_id = $1", [
        scenario.student.id,
      ]),
    ).toBe(2);
  });

  test("F-VINC-07 · o mesmo request_id não grava duas vezes", async ({ scenario }) => {
    /*
     * PELA RPC, E NÃO PELA TELA — e é o ponto da regra. O `request_id` é gerado
     * UMA VEZ, na origem, e a tela não tem como emitir duas chamadas com o
     * mesmo id de propósito: a proteção existe para a RETENTATIVA, que é a aba
     * que recarrega no meio da gravação ou a rede que repete o pedido. O que se
     * exercita aqui é o que aconteceria nessas duas situações.
     */
    const chave = randomUUID();
    const liberar = (months: number, requestId: string) =>
      asUser(scenario.teacher.id, (client) =>
        client.query("select * from public.set_student_access($1, 'grant', $2, $3)", [
          scenario.student.id,
          months,
          requestId,
        ]),
      );

    const primeira = await liberar(3, chave);
    const repetida = await liberar(3, chave);

    expect(repetida.rows[0]).toEqual(primeira.rows[0]);
    expect(
      await count("select count(*) from public.access_grants where request_id = $1", [chave]),
    ).toBe(1);

    // Mesmo id com outro payload é rejeitado: aceitar seria devolver o
    // resultado de um pedido que ninguém fez.
    await expect(liberar(6, chave)).rejects.toThrow(/outro pedido/);
  });

  test("F-VINC-08 · bloquear preserva a vigência e devolve o aluno à lista de espera", async ({
    teacherPage,
    signIn,
    scenario,
  }) => {
    await teacherPage.goto(`/professor/alunos/${scenario.student.id}`);
    await testId(teacherPage, "grant-access").click();
    await expect(alert(teacherPage, "success")).toBeVisible();

    const liberado = await one<{ vence: string }>(
      "select to_char(access_expires_at, 'YYYY-MM-DD') as vence from public.profiles where id = $1",
      [scenario.student.id],
    );

    await testId(teacherPage, "revoke-access").click();
    await expect(alert(teacherPage, "success")).toContainText("bloqueado");
    await expect(content(teacherPage)).toContainText("Suspenso");

    const bloqueado = await one<{ status: string; vence: string }>(
      `select access_status::text as status,
              to_char(access_expires_at, 'YYYY-MM-DD') as vence
         from public.profiles where id = $1`,
      [scenario.student.id],
    );
    expect(bloqueado.status).toBe("suspended");
    // A data FICA: dá para reativar sem redigitar, e fica auditável até quando
    // o acesso valia.
    expect(bloqueado.vence).toBe(liberado.vence);

    await signIn(scenario.student);
    await teacherPage.goto("/aluno");
    await expect(teacherPage).toHaveURL(/\/aluno\/lista-espera$/);
  });
});

test.describe("F-MATR · turmas", () => {
  test("F-MATR-01 · criar, renomear e matricular", async ({ teacherPage, scenario }) => {
    const nome = `Turma ${scenario.planId.slice(0, 8)}`;

    await teacherPage.goto("/professor/turmas");
    await teacherPage.getByRole("button", { name: "Nova turma" }).click();
    await field(teacherPage, "name").fill(nome);
    await testId(teacherPage, "class-dialog").getByRole("button", { name: "Criar" }).click();
    await expect(testId(teacherPage, "class-dialog")).toHaveCount(0);

    const turma = await one<{ id: string }>("select id from public.classes where name = $1", [
      nome,
    ]);

    await teacherPage
      .locator(`[data-testid="class-row"][data-class-id="${turma.id}"]`)
      .getByTestId("class-rename")
      .click();
    await field(teacherPage, "name").fill(`${nome} (manhã)`);
    await testId(teacherPage, "class-dialog").getByRole("button", { name: "Salvar" }).click();
    await expect(testId(teacherPage, "class-dialog")).toHaveCount(0);
    await expect(
      teacherPage.locator(`[data-testid="class-row"][data-class-id="${turma.id}"]`),
    ).toBeVisible();

    // MATRICULAR É NA FICHA DO ALUNO: a pergunta "em que turma este aluno está"
    // é sobre o aluno, e resolvê-la na tela de turmas obrigaria a abrir a turma
    // certa antes de saber qual é.
    await teacherPage.goto(`/professor/alunos/${scenario.student.id}`);
    await escolherTurma(teacherPage, `${nome} (manhã)`);

    await teacherPage.goto("/professor");
    await expect(
      teacherPage.locator(`[data-testid="student-card"][data-student-id="${scenario.student.id}"]`),
    ).toContainText(`${nome} (manhã)`);
  });

  test("F-MATR-02 · matricular quem já está em outra turma MOVE", async ({
    teacherPage,
    scenario,
  }) => {
    const turmas = await criarTurmas(teacherPage, scenario.planId, 2);
    const primeira = turmas[0]!;
    const segunda = turmas[1]!;

    await teacherPage.goto(`/professor/alunos/${scenario.student.id}`);
    await escolherTurma(teacherPage, primeira.nome);
    await escolherTurma(teacherPage, segunda.nome);

    // O índice único `class_students_one_per_student_uidx` impede as duas
    // matrículas coexistirem — e é por isso que mover é UM update, e não um par
    // apagar/inserir que deixaria o aluno sem turma no meio do caminho.
    const matriculas = await query<{ class_id: string }>(
      "select class_id from public.class_students where student_id = $1",
      [scenario.student.id],
    );
    expect(matriculas).toHaveLength(1);
    expect(matriculas[0]!.class_id).toBe(segunda.id);
  });

  test("F-MATR-03 · apagar turma com aluno dentro é recusado", async ({
    teacherPage,
    scenario,
  }) => {
    const turma = (await criarTurmas(teacherPage, scenario.planId, 1))[0]!;

    await teacherPage.goto(`/professor/alunos/${scenario.student.id}`);
    await escolherTurma(teacherPage, turma.nome);

    await teacherPage.goto("/professor/turmas");
    const linha = teacherPage.locator(`[data-testid="class-row"][data-class-id="${turma.id}"]`);
    await expect(linha).toHaveAttribute("data-students", "1");
    await linha.getByTestId("class-delete").click();

    // A recusa é do GATILHO, e a tela repassa a frase dele em português.
    await expect(alert(content(teacherPage), "error")).toContainText("Esvazie a turma");
    expect(await count("select count(*) from public.classes where id = $1", [turma.id])).toBe(1);

    await linha.getByTestId("member-remove").click();
    await expect(linha).toHaveAttribute("data-students", "0");
    await linha.getByTestId("class-delete").click();

    await expect(
      teacherPage.locator(`[data-testid="class-row"][data-class-id="${turma.id}"]`),
    ).toHaveCount(0);
    expect(await count("select count(*) from public.classes where id = $1", [turma.id])).toBe(0);
  });

  test("F-MATR-04 · `?turma=` recorta, e valor inválido devolve a lista inteira", async ({
    teacherPage,
    scenario,
    consoleErrors,
  }) => {
    const turmas = await criarTurmas(teacherPage, scenario.planId, 2);
    const comAluno = turmas[0]!;
    const vazia = turmas[1]!;

    await teacherPage.goto(`/professor/alunos/${scenario.student.id}`);
    await escolherTurma(teacherPage, comAluno.nome);

    await teacherPage.goto(`/professor?turma=${comAluno.id}`);
    await expect(testId(teacherPage, "student-card")).toHaveCount(1);

    await teacherPage.goto(`/professor?turma=${vazia.id}`);
    await expect(testId(teacherPage, "empty")).toContainText("Nenhum aluno com esse recorte");

    // A QUERY STRING NÃO É UMA PORTA: um id inventado é ignorado, e a lista
    // volta inteira em vez de virar erro de tela.
    await teacherPage.goto("/professor?turma=11111111-1111-4111-8111-999999999999");
    await expect(testId(teacherPage, "student-card")).toHaveCount(1);
    expect(consoleErrors).toEqual([]);
  });

  test("F-MATR-05 · turma e matrícula de outro professor não existem para este", async ({
    teacherPage,
    signIn,
    scenario,
  }) => {
    const turma = (await criarTurmas(teacherPage, scenario.planId, 1))[0]!;
    await teacherPage.goto(`/professor/alunos/${scenario.student.id}`);
    await escolherTurma(teacherPage, turma.nome);

    // `teacherPage` e `studentPage` são a MESMA aba: quem precisa de dois
    // papéis troca de identidade com `signIn`.
    const vizinho = await createUser("teacher", "Professora Vizinha", "prof");
    await signIn(vizinho);

    await teacherPage.goto("/professor/turmas");
    await expect(testId(teacherPage, "class-row")).toHaveCount(0);
    await expect(testId(teacherPage, "empty")).toContainText("Nenhuma turma");

    // Não existe status 404 neste servidor: o teste verifica a TELA e a
    // ausência do dado no HTML.
    await teacherPage.goto(`/professor?turma=${turma.id}`);
    await expect(testId(teacherPage, "student-card")).toHaveCount(0);
    await expect(content(teacherPage)).not.toContainText(scenario.student.name);

    // E as duas recusas de escrita continuam sendo do banco — `is_teacher_of`
    // no WITH CHECK, e a FK composta na turma de destino. Ver
    // `supabase/tests/02_rls.sql`.
    await expect(
      asUser(vizinho.id, (client) =>
        client.query(
          `insert into public.class_students (class_id, student_id, teacher_id)
           values ($1, $2, $3)`,
          [turma.id, scenario.student.id, vizinho.id],
        ),
      ),
    ).rejects.toThrow();
  });
});

/** Cria N turmas pela TELA, com nome único por cenário. */
async function criarTurmas(
  page: Page,
  mark: string,
  quantidade: number,
): Promise<{ id: string; nome: string }[]> {
  const criadas: { id: string; nome: string }[] = [];

  await page.goto("/professor/turmas");
  for (let indice = 1; indice <= quantidade; indice += 1) {
    const nome = `Turma ${indice} ${mark.slice(0, 8)}`;
    await page.getByRole("button", { name: "Nova turma" }).click();
    await field(page, "name").fill(nome);
    await testId(page, "class-dialog").getByRole("button", { name: "Criar" }).click();
    await expect(testId(page, "class-dialog")).toHaveCount(0);

    const turma = await one<{ id: string }>("select id from public.classes where name = $1", [
      nome,
    ]);
    criadas.push({ id: turma.id, nome });
  }

  return criadas;
}

/** Escolhe a turma na ficha do aluno e salva. */
async function escolherTurma(page: Page, nome: string): Promise<void> {
  await page.getByRole("combobox", { name: "Turma" }).click();
  await page.getByRole("option", { name: nome }).click();
  await testId(page, "save-class").click();
  // ESPERA A GRAVAÇÃO, e não o `<select>`: o valor do seletor muda no `change`,
  // ANTES de a escrita sair. Navegar nesse instante aborta a requisição em voo,
  // e o teste passa a acusar "sem turma" quando o que faltou foi esperar.
  await expect(alert(testId(page, "class-form"), "success")).toContainText("Turma salva");
}
