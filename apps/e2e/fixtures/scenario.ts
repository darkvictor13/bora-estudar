/**
 * Fábrica de cenários: um par professor/aluno novo por teste.
 *
 * O `docs/fluxos-e2e.md` diz que `db:reset` é a única forma confiável de
 * isolar um teste do anterior. É verdade *quando os testes compartilham o
 * aluno do seed* — e resetar entre testes obriga a rodar tudo em série, o que
 * é exatamente o que esta suíte não pode pagar.
 *
 * A saída aqui é outra: nenhum teste toca o aluno do seed. Cada um recebe
 * professor, aluno, vínculo, acesso, planejamento, cadernos e metas próprios,
 * com UUID e e-mail gerados. Dois testes não têm como colidir porque não existe
 * linha em comum — nem o índice de bateria aberta por planejamento.
 *
 * O que continua compartilhado é `catalog_blocks`, que é leitura — e está
 * vazio: a carga do catálogo é do professor, pela tela, e o seed não a faz.
 */
import { randomUUID } from "node:crypto";

import { asUser, query, value } from "./db.ts";

/**
 * Os nomes de dia que `goals.weekday_name` guarda.
 *
 * Duplicados de `@bora/ui` de propósito: a suíte não importa do pacote da
 * interface — ela testa o que o SITE renderiza, e puxar o mesmo array faria um
 * erro de tradução passar despercebido nos dois lados ao mesmo tempo.
 */
const WEEKDAY_NAMES = [
  "Segunda-feira",
  "Terça-feira",
  "Quarta-feira",
  "Quinta-feira",
  "Sexta-feira",
  "Sábado",
  "Domingo",
] as const;

/** Senha única de todo usuário de teste. Ambiente local, credencial pública. */
export const TEST_PASSWORD = "E2ePass#2026!";

/**
 * Catálogo compartilhado, com os ids do seed.
 *
 * O `global-setup` garante que existam. São 30 questões por bloco: o mínimo
 * para uma bateria de 15 principais deixar 15 inéditas para a seguinte.
 */
export const CATALOG = {
  key: "pcpr26",
  blocks: [
    {
      id: "cb000000-0000-4000-8000-000000000001",
      blockKey: "pcpr26_forenses_01",
      name: "Bloco 1 — Introdução às Ciências Forenses",
      subjectKey: "forenses",
      subjectName: "Ciências Forenses",
      subjectColor: "#6B3FA0",
      firstQuestionId: 100001,
      topics: ["Local de crime", "Cadeia de custódia", "Perícia papiloscópica"],
    },
    {
      id: "cb000000-0000-4000-8000-000000000002",
      blockKey: "pcpr26_penal_01",
      name: "Bloco 1 — Teoria Geral do Crime",
      subjectKey: "penal",
      subjectName: "Direito Penal",
      subjectColor: "#1A56DB",
      firstQuestionId: 200001,
      topics: ["Tipicidade", "Ilicitude", "Culpabilidade"],
    },
  ],
} as const;

/** `main_target` é fixo em `start_quiz_session`. */
export const MAIN_TARGET = 15;

export type AccessStatus = "active" | "pending" | "suspended" | "expired" | "none";

export interface ScenarioOptions {
  /** Situação da assinatura do aluno. `none` não cria linha nenhuma. */
  readonly access?: AccessStatus;
  /** `false` deixa o aluno sem planejamento — cenário de estado vazio. */
  readonly withPlan?: boolean;
  /** `false` cria o planejamento sem meta alguma. */
  readonly withGoals?: boolean;
  /** Situação do planejamento. Só `active` é visível para o aluno. */
  readonly planStatus?: "draft" | "active" | "paused" | "archived";
  /** Meta percentual da disciplina, usada nos badges "Na meta"/"Abaixo". */
  readonly subjectTarget?: number;
  /** `false` cria o aluno sem vínculo com professor nenhum. */
  readonly withLink?: boolean;
}

export interface Person {
  readonly id: string;
  readonly email: string;
  readonly password: string;
  readonly name: string;
}

export interface ScenarioBlock {
  readonly id: string;
  readonly catalogBlockId: string;
  readonly name: string;
  readonly subjectName: string;
  readonly firstQuestionId: number;
}

export interface ScenarioGoal {
  readonly id: string;
  readonly type: "theory" | "question_block" | "review" | "reinforcement" | "mock_exam" | "extra";
  readonly title: string;
  readonly weekday: number;
  readonly blockId: string | null;
}

export interface Scenario {
  readonly teacher: Person;
  readonly student: Person;
  readonly planId: string;
  readonly planName: string;
  readonly blocks: readonly ScenarioBlock[];
  readonly goals: readonly ScenarioGoal[];
  /** Primeira meta de bateria da semana 1. É a que os testes de bateria usam. */
  readonly quizGoal: ScenarioGoal;
}

// ---------------------------------------------------------------------------
// Usuários
// ---------------------------------------------------------------------------

/**
 * Hash bcrypt da senha de teste, calculado uma vez por processo.
 *
 * `gen_salt('bf')` custa ~100 ms. O hash carrega o próprio salt, então o mesmo
 * valor serve para todos os usuários deste worker — o que transforma um custo
 * por usuário em um custo por processo.
 */
let passwordHash: Promise<string> | null = null;

function hashedPassword(): Promise<string> {
  passwordHash ??= value<string>("select extensions.crypt($1, extensions.gen_salt('bf'))", [
    TEST_PASSWORD,
  ]);
  return passwordHash;
}

let sequence = 0;

/** E-mail curto, único e reconhecível: sobra no banco é sempre identificável. */
function uniqueEmail(prefix: string): string {
  sequence += 1;
  return `${prefix}-${process.pid}-${Date.now().toString(36)}-${sequence}@e2e.local`;
}

/**
 * Cria um usuário do GoTrue capaz de fazer login por senha.
 *
 * `auth.identities` não é opcional: sem a identidade do provedor `email` o
 * login falha mesmo com o usuário existindo.
 *
 * O PERFIL É INSERIDO AQUI, E ISSO É UM REMENDO COM DATA PARA SAIR.
 *
 * Até o schema de 13/09 o perfil vinha do gatilho em `auth.users`, e esta
 * fixture não desviava da regra de negócio: criar usuário aqui percorria o
 * mesmo caminho do cadastro público. O schema de 14/09 não trouxe esse gatilho
 * — `docs/de-para-schema.md` o lista como pendência, com a decisão de produto
 * que falta (a qual professor um aluno sem metadado é anexado).
 *
 * Sem perfil, `loadSession` devolve `null` e TODO teste da suíte vira
 * "redirecionado para /entrar". Inserir a linha aqui devolve a rede de
 * segurança às outras fases; o que ela NÃO faz é provar que o cadastro público
 * cria perfil — esse teste está marcado `fixme` em `auth.spec.ts`, e é o único
 * lugar onde a falta precisa continuar visível.
 *
 * Quando o gatilho existir: apague o segundo `insert` e o teste volta a ser o
 * caminho real.
 */
export async function createUser(
  role: "student" | "teacher",
  name: string,
  // Anotado como `string`, e não inferido do valor padrão: sem a anotação o
  // tipo do parâmetro vira o do `role` e nenhum prefixo livre é aceito.
  emailPrefix: string = role,
): Promise<Person> {
  const id = randomUUID();
  const email = uniqueEmail(emailPrefix);

  await query(
    `insert into auth.users (
       instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
       raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
       confirmation_token, email_change, email_change_token_new, recovery_token
     ) values (
       '00000000-0000-0000-0000-000000000000', $1, 'authenticated', 'authenticated', $2, $3, now(),
       '{"provider":"email","providers":["email"]}'::jsonb,
       jsonb_build_object('role', $4::text, 'name', $5::text, 'email_verified', true),
       now(), now(), '', '', '', ''
     )`,
    [id, email, await hashedPassword(), role, name],
  );

  /**
   * Todo parâmetro vai com cast explícito, e o id entra duas vezes.
   *
   * `provider_id` é `text` e `user_id` é `uuid`: um único `$1` nas duas colunas
   * é recusado com "inconsistent types deduced". E `jsonb_build_object` recebe
   * argumentos `any`, que não ajudam a inferência — sem o `::text` o Postgres
   * responde "could not determine data type of parameter".
   */
  await query(
    `insert into auth.identities (
       provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at
     ) values (
       $1::text, $2::uuid,
       jsonb_build_object('sub', $3::text, 'email', $4::text, 'email_verified', true),
       'email', now(), now(), now()
     )`,
    [id, id, id, email],
  );

  // O remendo descrito acima. `access_status` nasce `pending`: quem libera é
  // `setAccess`, e um aluno que nasce liberado esconderia o caminho de bloqueio.
  await query(
    `insert into public.profiles (id, name, role)
     values ($1, $2, $3::public.user_role)`,
    [id, name, role],
  );

  return { id, email, password: TEST_PASSWORD, name };
}

/** Remove o usuário e tudo que pende dele. Só serve para quem não tem histórico. */
export async function deleteUser(userId: string): Promise<void> {
  // `student_teacher_links` deixou de existir: o vínculo virou `profiles.teacher_id`,
  // e sai junto com o perfil pelo `on delete cascade` de `auth.users`.
  await query("delete from public.waitlist where student_id = $1", [userId]);
  await query("delete from auth.users where id = $1", [userId]);
}

// ---------------------------------------------------------------------------
// Assinatura
// ---------------------------------------------------------------------------

/**
 * Vigência coerente com o status.
 *
 * Uma linha `expired` com validade aberta é a divergência que o BUG-07
 * explorava, e por isso a data acompanha o status em vez de ser sempre nula.
 * `pending`, `suspended` e `none` ficam sem vigência: não é o prazo que os
 * bloqueia, é o estado.
 */
function expiryFor(status: Exclude<AccessStatus, "none">): string | null {
  if (status === "expired") return "2020-06-01";
  if (status === "active") return null; // acesso ativo sem prazo
  return null;
}

/**
 * A assinatura virou DUAS COLUNAS EM `profiles`.
 *
 * `subscriptions` saiu no schema de 14/09: o acesso é `profiles.access_status`
 * mais `profiles.access_expires_at`. `none` não tem como significar "sem linha
 * nenhuma" num modelo de coluna, então virou `pending` — que é como o schema
 * representa quem ainda não foi liberado, e é o estado em que todo perfil
 * nasce.
 *
 * O `update` roda como dono do banco, de propósito: `grant update (name)`
 * deixa `access_status` fora do alcance de `authenticated`, porque liberar
 * acesso precisa nascer como RPC. A fixture não é a aplicação; ela monta a
 * pré-condição que a RPC vai passar a montar.
 */
export async function setAccess(studentId: string, status: AccessStatus): Promise<void> {
  const effective = status === "none" ? "pending" : status;
  await query(
    `update public.profiles
        set access_status = $2::public.access_status,
            access_expires_at = $3::date
      where id = $1`,
    [studentId, effective, expiryFor(effective)],
  );
}

// ---------------------------------------------------------------------------
// Cenário completo
// ---------------------------------------------------------------------------

interface GoalSeed {
  readonly weekday: number;
  readonly position: number;
  readonly type: ScenarioGoal["type"];
  readonly subject: string;
  readonly title: string;
  readonly planned_minutes: number;
  readonly description?: string;
  readonly lesson?: string;
  readonly block?: string;
  readonly block_id?: string;
}

/**
 * Metas da semana 1: 2 de teoria, 2 de bateria, 1 extra.
 *
 * O título leva um sufixo do planejamento. Sem ele dois cenários produzem metas
 * com o MESMO título, e um teste de isolamento que procure "a meta do vizinho
 * na minha tela" encontra a própria e falha — ou, pior, passa quando houver
 * vazamento de verdade.
 *
 * `subject` é obrigatório no schema novo, e é o que a tela agrupa: sem ele a
 * meta aparece sem matéria e o seletor de estudo extra abre vazio.
 */
function weekOneGoals(blockIds: readonly string[], suffix: string): readonly GoalSeed[] {
  const [first, second] = blockIds;
  return [
    {
      weekday: 1,
      position: 1,
      type: "theory",
      subject: "Ciências Forenses",
      title: `Teoria — Local de crime · ${suffix}`,
      lesson: "Local de crime",
      planned_minutes: 60,
      description: "Leitura do capítulo 1 antes da bateria.",
    },
    {
      weekday: 1,
      position: 2,
      type: "question_block",
      subject: "Ciências Forenses",
      title: `Bateria — Introdução às Ciências Forenses · ${suffix}`,
      block: "Bloco 1 — Introdução às Ciências Forenses",
      planned_minutes: 90,
      ...(first ? { block_id: first } : {}),
    },
    {
      weekday: 3,
      position: 1,
      type: "theory",
      subject: "Direito Penal",
      title: `Teoria — Teoria Geral do Crime · ${suffix}`,
      lesson: "Teoria Geral do Crime",
      planned_minutes: 60,
    },
    {
      weekday: 3,
      position: 2,
      type: "question_block",
      subject: "Direito Penal",
      title: `Bateria — Teoria Geral do Crime · ${suffix}`,
      block: "Bloco 1 — Teoria Geral do Crime",
      planned_minutes: 90,
      ...(second ? { block_id: second } : {}),
    },
    {
      weekday: 5,
      position: 1,
      type: "extra",
      subject: "Direito Penal",
      title: `Revisão livre da semana · ${suffix}`,
      planned_minutes: 45,
    },
  ];
}

export async function createScenario(options: ScenarioOptions = {}): Promise<Scenario> {
  const {
    access = "active",
    withPlan = true,
    withGoals = true,
    planStatus = "active",
    subjectTarget = 80,
    withLink = true,
  } = options;

  // NOME ÚNICO, pelo mesmo motivo do sufixo nos títulos das metas: dois
  // cenários com "Aluno E2E" fazem um teste de isolamento encontrar o PRÓPRIO
  // aluno na tela do vizinho e passar — ou falhar — pelo motivo errado.
  const mark = `${process.pid}-${(sequence + 1).toString(36)}`;
  const teacher = await createUser("teacher", `Professora ${mark}`, "prof");
  const student = await createUser("student", `Aluno ${mark}`, "aluno");

  // O vínculo virou `profiles.teacher_id` — uma coluna, não uma tabela de
  // ligação com vigência. Um aluno tem um professor de cada vez, que é o que o
  // produto sempre fez; a tabela permitia dois vínculos vigentes e a suíte
  // tinha um índice único só para impedir isso.
  if (withLink) {
    await query("update public.profiles set teacher_id = $2 where id = $1", [
      student.id,
      teacher.id,
    ]);
  }
  await setAccess(student.id, access);

  // AS DISCIPLINAS SÃO DO PROFESSOR, e não do planejamento: `subjects.teacher_id`
  // é a dona. Elas são o que dá PESO à geração de metas — sem nenhuma, a semana
  // não tem como ser distribuída, e o professor vê "nenhuma disciplina com
  // peso" em vez da prévia.
  for (const [index, catalogBlock] of CATALOG.blocks.entries()) {
    await query(
      `insert into public.subjects (teacher_id, name, color, weight, target_score)
       values ($1, $2, $3, $4, $5)`,
      [
        teacher.id,
        catalogBlock.subjectName,
        catalogBlock.subjectColor,
        CATALOG.blocks.length - index,
        subjectTarget,
      ],
    );
  }

  const planId = randomUUID();
  const planName = `Plano E2E ${planId.slice(0, 8)}`;
  const blocks: ScenarioBlock[] = [];
  const goals: ScenarioGoal[] = [];

  if (withPlan) {
    // A SEMANA 1 COMEÇA NA SEGUNDA DESTA SEMANA, e não em `current_date`.
    // `weekBounds` conta de sete em sete a partir de `starts_on`, então um
    // planejamento que começa numa quinta põe a semana 1 de quinta a quarta —
    // correto, e péssimo para um teste que quer saber em que dia uma meta cai.
    await query(
      `insert into public.study_plans
         (id, student_id, teacher_id, name, area, target_exam, stage, study_model,
          weekly_goals, starts_on, status)
       values ($1, $2, $3, $4, 'Policial', 'PCPR — Investigador', 'Pré-edital',
               'Avanço progressivo', 24, date_trunc('week', current_date)::date,
               $5::public.study_plan_status)`,
      [planId, student.id, teacher.id, planName, planStatus],
    );

    // Os cadernos TEC do planejamento. `study_plan_blocks` virou
    // `study_plan_notebooks`, e `block_id` passou a ser a IDENTIDADE do
    // caderno — um uuid que o gatilho `protect_notebook_identity` congela —
    // em vez de uma FK para o catálogo.
    for (const [index, catalogBlock] of CATALOG.blocks.entries()) {
      const id = randomUUID();
      await query(
        `insert into public.study_plan_notebooks
           (block_id, study_plan_id, student_id, teacher_id,
            subject_key, subject_name, subject_color, subject_target,
            notebook_key, notebook_name, notebook_link, total_questions,
            subject_position, notebook_position)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
                 'https://www.tecconcursos.com.br/', 30, $11, 1)`,
        [
          id,
          planId,
          student.id,
          teacher.id,
          catalogBlock.subjectKey,
          catalogBlock.subjectName,
          catalogBlock.subjectColor,
          subjectTarget,
          catalogBlock.blockKey,
          catalogBlock.name,
          index,
        ],
      );
      blocks.push({
        id,
        catalogBlockId: catalogBlock.id,
        name: catalogBlock.name,
        subjectName: catalogBlock.subjectName,
        firstQuestionId: catalogBlock.firstQuestionId,
      });
    }

    if (withGoals) {
      // POR INSERT, E NÃO PELA RPC. `apply_study_plan_batch` não foi portada, e
      // a fronteira mudou junto: planejamento é escrita direta com RLS e grant
      // por coluna. Impersonar o professor mantém o que importava na versão
      // anterior — se a RLS de planejamento regredir, o cenário falha aqui em
      // vez de fabricar dado que nenhuma tela consegue explicar.
      const suffix = planId.slice(0, 8);
      for (const goal of weekOneGoals(blocks.map((b) => b.id), suffix)) {
        await asUser(teacher.id, (client) =>
          client.query(
            `insert into public.goals
               (study_plan_id, teacher_id, student_id, week_number, weekday,
                weekday_name, day_position, type, subject, title, description,
                lesson, block, planned_minutes, notebook_block_id)
             values ($1, $2, $3, 1, $4, $5, $6, $7::public.goal_type, $8, $9, $10,
                     $11, $12, $13, $14)`,
            [
              planId,
              teacher.id,
              student.id,
              goal.weekday,
              WEEKDAY_NAMES[goal.weekday - 1],
              goal.position,
              goal.type,
              goal.subject,
              goal.title,
              goal.description ?? null,
              goal.lesson ?? null,
              goal.block ?? null,
              goal.planned_minutes,
              goal.block_id ?? null,
            ],
          ),
        );
      }

      const rows = await query<{
        id: string;
        type: ScenarioGoal["type"];
        title: string;
        weekday: number;
        notebook_block_id: string | null;
      }>(
        `select id, type::text, title, weekday, notebook_block_id
           from public.goals
          where study_plan_id = $1
          order by week_number, weekday, day_position`,
        [planId],
      );
      goals.push(
        ...rows.map((row) => ({
          id: row.id,
          type: row.type,
          title: row.title,
          weekday: row.weekday,
          blockId: row.notebook_block_id,
        })),
      );
    }
  }

  const quizGoal = goals.find((goal) => goal.type === "question_block");

  return {
    teacher,
    student,
    planId,
    planName,
    blocks,
    goals,
    // Um cenário sem meta de bateria é legítimo (estado vazio), mas ler
    // `quizGoal` nele é erro de teste. Falhar com esta mensagem é melhor do
    // que espalhar `!` por toda a suíte.
    get quizGoal(): ScenarioGoal {
      if (!quizGoal) throw new Error("este cenário não tem meta de bateria");
      return quizGoal;
    },
  };
}

/**
 * Acrescenta uma semana com uma bateria por bloco.
 *
 * Cada bloco cai num dia diferente porque `goal_position_uidx` é único em
 * (plano, semana, dia, ordem): empilhar tudo no mesmo dia funcionaria, mas
 * qualquer teste que depois somasse metas por dia leria o que o vizinho
 * deixou. Um dia por bloco mantém a leitura óbvia.
 */
export async function addWeek(
  scenario: Scenario,
  week: number,
): Promise<readonly ScenarioGoal[]> {
  for (const [index, block] of scenario.blocks.entries()) {
    await asUser(scenario.teacher.id, (client) =>
      client.query(
        `insert into public.goals
           (study_plan_id, teacher_id, student_id, week_number, weekday, weekday_name,
            day_position, type, subject, title, block, planned_minutes, notebook_block_id)
         values ($1, $2, $3, $4, $5, $6, 1, 'question_block', $7, $8, $9, 90, $10)`,
        [
          scenario.planId,
          scenario.teacher.id,
          scenario.student.id,
          week,
          index + 1,
          WEEKDAY_NAMES[index],
          block.subjectName,
          `Bateria semana ${week} — ${block.subjectName} · ${scenario.planId.slice(0, 8)}`,
          block.name,
          block.id,
        ],
      ),
    );
  }

  const rows = await query<{
    id: string;
    type: ScenarioGoal["type"];
    title: string;
    weekday: number;
    notebook_block_id: string | null;
  }>(
    `select id, type::text, title, weekday, notebook_block_id
       from public.goals
      where study_plan_id = $1 and week_number = $2
      order by weekday, day_position`,
    [scenario.planId, week],
  );

  return rows.map((row) => ({
    id: row.id,
    type: row.type,
    title: row.title,
    weekday: row.weekday,
    blockId: row.notebook_block_id,
  }));
}
// ---------------------------------------------------------------------------
// Leituras de conferência
//
// AS DOZE AJUDANTES DE BATERIA, CUPOM E REVISÃO SAÍRAM AQUI. Liam
// `study_plan_blocks`, `catalog_questions`, `review_spacings`,
// `review_completions`, `goals.deleted_at` e as views `vw_*` — nada disso existe
// no schema de 14/09/2026, e nenhum teste as usava: eram fixtures que só
// falhariam se alguém as chamasse. Voltam junto com o motor de baterias, e a
// forma antiga está em `git show feda119:apps/e2e/fixtures/scenario.ts`.
// ---------------------------------------------------------------------------

/* ------------------------------------------------------------------ *
 * Catálogo de teoria — Fase 4
 * ------------------------------------------------------------------ */

export interface TheoryCatalogOptions {
  /** Aulas por disciplina auditada. */
  readonly lessons?: number;
  /** Mínimo de questões iniciais. */
  readonly initialQuestions?: number;
  /** Espaçamento da revisão 1, em AULAS concluídas. */
  readonly reviewSpacing?: number;
  /** `true` acrescenta uma disciplina SEM páginas auditadas. */
  readonly withUnaudited?: boolean;
}

export interface TheoryLessonRef {
  readonly id: string;
  readonly subject: string;
  readonly lessonCode: string;
  readonly title: string;
  readonly theoryStartPage: number | null;
  readonly theoryEndPage: number | null;
}

export interface TheoryCatalog {
  readonly id: string;
  readonly lessons: readonly TheoryLessonRef[];
  /** A disciplina auditada, com o nome que as metas usam. */
  readonly subject: string;
  readonly unauditedSubject: string;
}

/**
 * Um catálogo de teoria vinculado ao planejamento do cenário.
 *
 * A DISCIPLINA SEM PÁGINAS é opcional mas importa: é o caso em que a v2 mostra
 * o diagnóstico em vez do controle, e sem ela ninguém exercita esse caminho.
 */
export async function addTheoryCatalog(
  scenario: Scenario,
  options: TheoryCatalogOptions = {},
): Promise<TheoryCatalog> {
  const {
    lessons = 4,
    initialQuestions = 15,
    reviewSpacing = 2,
    withUnaudited = false,
  } = options;

  const catalogId = randomUUID();
  const subject = "Ciências Forenses";
  const subjectKey = "ciencias forenses";
  const unauditedSubject = "Matemática Financeira";

  await query(
    `insert into public.theory_catalogs (id, teacher_id, name, key)
     values ($1, $2, $3, $4)`,
    [catalogId, scenario.teacher.id, `Catálogo E2E ${catalogId.slice(0, 8)}`, `e2e-${catalogId.slice(0, 8)}`],
  );

  await query(
    `insert into public.study_plan_theory_catalogs
       (study_plan_id, catalog_id, teacher_id, student_id)
     values ($1, $2, $3, $4)`,
    [scenario.planId, catalogId, scenario.teacher.id, scenario.student.id],
  );

  // Teoria da página 5 à 5 + 12*n, para o intervalo ser diferente em cada aula
  // e um teste que troque de aula não passar por acidente.
  await query(
    `insert into public.theory_lessons
       (catalog_id, teacher_id, subject, subject_key, lesson_code, position, title,
        pdf_file, theory_start_page, theory_end_page, pdf_total_pages,
        final_questions_start, has_theory)
     select $1::uuid, $2::uuid, $3::text, $4::text,
            format('A%s', lpad(g::text, 2, '0')), g,
            format('Aula %s — %s', lpad(g::text, 2, '0'), $3::text),
            format('e2e-aula-%s.pdf', lpad(g::text, 2, '0')),
            5, 5 + (g * 12), 5 + (g * 12) + 20, 5 + (g * 12) + 1, true
       from generate_series(1, $5::int) g`,
    [catalogId, scenario.teacher.id, subject, subjectKey, lessons],
  );

  if (withUnaudited) {
    await query(
      `insert into public.theory_lessons
         (catalog_id, teacher_id, subject, subject_key, lesson_code, position, title,
          pdf_file, theory_start_page, theory_end_page, pdf_total_pages, has_theory)
       values ($1, $2, $3, $4, 'A01', 1, 'Aula 01 — Matemática Financeira',
               'mat-fin-01.pdf', null, null, 40, false)`,
      [catalogId, scenario.teacher.id, unauditedSubject, "matematica financeira"],
    );
  }

  await query(
    `insert into public.theory_catalog_subject_rules
       (catalog_id, teacher_id, subject, subject_key, initial_questions)
     values ($1, $2, $3, $4, $5)`,
    [catalogId, scenario.teacher.id, subject, subjectKey, initialQuestions],
  );

  await query(
    `insert into public.theory_review_rules
       (catalog_id, teacher_id, subject, subject_key, review_number, lesson_spacing, minimum_questions)
     values ($1, $2, $3, $4, 1, $5, 10)`,
    [catalogId, scenario.teacher.id, subject, subjectKey, reviewSpacing],
  );

  const rows = await query<{
    id: string;
    subject: string;
    lesson_code: string;
    title: string;
    theory_start_page: number | null;
    theory_end_page: number | null;
  }>(
    `select id, subject, lesson_code, title, theory_start_page, theory_end_page
       from public.theory_lessons where catalog_id = $1 order by subject, position`,
    [catalogId],
  );

  return {
    id: catalogId,
    subject,
    unauditedSubject,
    lessons: rows.map((row) => ({
      id: row.id,
      subject: row.subject,
      lessonCode: row.lesson_code,
      title: row.title,
      theoryStartPage: row.theory_start_page,
      theoryEndPage: row.theory_end_page,
    })),
  };
}

/** Uma meta de teoria avulsa, na disciplina pedida. */
export async function addTheoryGoal(
  scenario: Scenario,
  subject: string,
  week = 1,
  weekday = 2,
): Promise<string> {
  const rows = await query<{ id: string }>(
    `insert into public.goals
       (study_plan_id, teacher_id, student_id, week_number, weekday, weekday_name,
        day_position, type, subject, title, planned_minutes)
     values ($1, $2, $3, $4, $5, $6, 9, 'theory', $7, $8, 60)
     returning id`,
    [
      scenario.planId,
      scenario.teacher.id,
      scenario.student.id,
      week,
      weekday,
      WEEKDAY_NAMES[weekday - 1],
      subject,
      `Teoria — ${subject} · ${scenario.planId.slice(0, 8)}`,
    ],
  );
  return rows[0]!.id;
}
