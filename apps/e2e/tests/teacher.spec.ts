/**
 * O catálogo de `docs/fluxos-e2e.md` — telas do professor.
 *
 * REESCRITO NA FASE 6, e não convertido: as telas mudaram de forma junto com o
 * schema. A ficha do aluno era um modal e virou rota; gerar metas ganhou prévia
 * obrigatória; e três ações da v2 saíram porque o banco não as permite mais.
 *
 * O QUE NÃO ESTÁ AQUI, E POR QUÊ — nos três casos a defesa do banco é a certa,
 * e afrouxá-la para a tela funcionar abriria o buraco que ela fecha:
 *
 * - **F-VINC-04/05/06 · liberar, estender e suspender acesso.** `profiles`
 *   concede `UPDATE (name)` e mais nada; `access_status` e `access_expires_at`
 *   ficam fora do grant para que ninguém se promova nem estenda o próprio
 *   acesso. Precisa nascer como RPC.
 * - **F-ANUL-\* · anular bateria.** `quiz_sessions` é SELECT e nada mais, e
 *   `void_quiz_session` não foi portada.
 * - **F-VINC-01/02/03 · vincular candidato.** O vínculo virou
 *   `profiles.teacher_id`, também fora do grant.
 *
 * Os três estão marcados `fixme` no fim do arquivo, para a falta continuar
 * visível na saída da suíte.
 */
import { expect, test } from "../fixtures/index.ts";
import { count, one, query } from "../fixtures/db.ts";
import { addTheoryCatalog, addWeek } from "../fixtures/scenario.ts";
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

  test("diz o que ainda não dá para fazer, em vez de oferecer e falhar", async ({
    teacherPage,
    scenario,
  }) => {
    await teacherPage.goto(`/professor/alunos/${scenario.student.id}`);

    // Um botão que sempre colhe `42501` é pior do que botão nenhum.
    await expect(alert(teacherPage, "info")).toContainText("Liberar e bloquear acesso");
    await expect(content(teacherPage).getByRole("button", { name: /Liberar acesso/ })).toHaveCount(0);
    await expect(testId(teacherPage, "topic-difficulties-empty")).toContainText("catálogo de tópicos");
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

/* ------------------------------------------------------------------ *
 * O que este banco ainda não permite
 * ------------------------------------------------------------------ */

test.describe("F-VINC · acesso e vínculo", () => {
  /*
   * `profiles` concede `UPDATE (name)` e mais nada. `access_status`,
   * `access_expires_at` e `teacher_id` ficam FORA do grant — a RLS decide qual
   * linha e nunca qual coluna, e sem o grant por coluna o professor promoveria
   * aluno a professor. As três operações precisam nascer como RPC.
   */
  test.fixme("liberar acesso por N meses", async ({ teacherPage, scenario }) => {
    await teacherPage.goto(`/professor/alunos/${scenario.student.id}`);
    await teacherPage.getByRole("button", { name: "Liberar acesso" }).click();
    await expect(alert(teacherPage, "success")).toContainText("Acesso liberado");
  });

  test.fixme("suspender acesso", async ({ teacherPage, scenario }) => {
    await teacherPage.goto(`/professor/alunos/${scenario.student.id}`);
    await teacherPage.getByRole("button", { name: "Suspender" }).click();
    await expect(alert(teacherPage, "success")).toBeVisible();
  });

  test.fixme("vincular candidato da lista de espera", async ({ teacherPage }) => {
    await teacherPage.goto("/professor");
    await teacherPage.getByRole("button", { name: "Vincular" }).first().click();
    await expect(alert(teacherPage, "success")).toBeVisible();
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
