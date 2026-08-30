/**
 * Fábrica de cenários: um par professor/aluno novo por teste.
 *
 * O `docs/fluxos-e2e.md` diz que `db:reset` é a única forma confiável de
 * isolar um teste do anterior. É verdade *quando os testes compartilham o
 * aluno do seed* — e resetar entre testes obriga a rodar tudo em série, o que
 * é exatamente o que esta suíte não pode pagar.
 *
 * A saída aqui é outra: nenhum teste toca o aluno do seed. Cada um recebe
 * professor, aluno, vínculo, assinatura, planejamento, blocos e metas
 * próprios, com UUID e e-mail gerados. Dois testes não têm como colidir
 * porque não existe linha em comum — nem o índice de bateria aberta por
 * planejamento, nem o de vínculo vigente por aluno.
 *
 * O que continua compartilhado é só o catálogo de questões, que é leitura.
 */
import { randomUUID } from "node:crypto";

import type { AvailableQuestion } from "@bora/protocol";

import { asUser, query, value } from "./db.ts";

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
  readonly type: "theory" | "question_block" | "extra_study" | "reinforcement";
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
 * login falha mesmo com o usuário existindo. O perfil vem do gatilho
 * `tg_create_profile_for_new_user`, que lê `role` e `name` do metadata — é o
 * mesmo caminho do cadastro público, então criar usuário aqui não desvia da
 * regra de negócio.
 */
export async function createUser(
  role: "student" | "teacher" | "admin",
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

  return { id, email, password: TEST_PASSWORD, name };
}

/** Remove o usuário e tudo que pende dele. Só serve para quem não tem histórico. */
export async function deleteUser(userId: string): Promise<void> {
  await query("delete from public.student_teacher_links where student_id = $1", [userId]);
  await query("delete from public.waitlist where student_id = $1", [userId]);
  await query("delete from auth.users where id = $1", [userId]);
}

// ---------------------------------------------------------------------------
// Assinatura
// ---------------------------------------------------------------------------

/**
 * Vigência coerente com o status.
 *
 * A constraint `active_subscription_has_validity` só exige vigência para
 * `active`, então nada impediria uma linha `expired` com validade aberta — e é
 * justamente essa divergência entre o status e a data que o BUG-07 explorava.
 */
function validityFor(status: Exclude<AccessStatus, "none">): string {
  return status === "expired"
    ? "daterange('2020-01-01','2020-06-01','[)')"
    : "daterange(current_date, null, '[)')";
}

export async function setAccess(studentId: string, status: AccessStatus): Promise<void> {
  await query("delete from public.subscriptions where student_id = $1", [studentId]);
  if (status === "none") return;

  await query(
    `insert into public.subscriptions (student_id, status, plan, validity)
     values ($1, $2::public.access_status, 'e2e', ${validityFor(status)})`,
    [studentId, status],
  );
}

// ---------------------------------------------------------------------------
// Cenário completo
// ---------------------------------------------------------------------------

/**
 * Metas da semana 1: espelham o seed — 2 de teoria, 2 de bateria, 1 extra.
 *
 * O título leva um sufixo do planejamento. Sem ele dois cenários produzem
 * metas com o MESMO título, e um teste de isolamento que procure "a meta do
 * vizinho na minha tela" encontra a própria e falha — ou, pior, passa quando
 * houver vazamento de verdade.
 */
function weekOneGoals(blockIds: readonly string[], suffix: string): unknown[] {
  const [first, second] = blockIds;
  return [
    {
      weekday: 1,
      position: 1,
      type: "theory",
      title: `Teoria — Local de crime · ${suffix}`,
      planned_minutes: 60,
      teacher_note: "Leitura do capítulo 1 antes da bateria.",
    },
    {
      weekday: 1,
      position: 2,
      type: "question_block",
      block_id: first,
      title: `Bateria — Introdução às Ciências Forenses · ${suffix}`,
      planned_minutes: 90,
    },
    {
      weekday: 3,
      position: 1,
      type: "theory",
      title: `Teoria — Teoria Geral do Crime · ${suffix}`,
      planned_minutes: 60,
    },
    {
      weekday: 3,
      position: 2,
      type: "question_block",
      block_id: second,
      title: `Bateria — Teoria Geral do Crime · ${suffix}`,
      planned_minutes: 90,
    },
    {
      weekday: 5,
      position: 1,
      type: "extra_study",
      title: `Revisão livre da semana · ${suffix}`,
      extra_activity: "review",
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

  const teacher = await createUser("teacher", "Professora E2E", "prof");
  const student = await createUser("student", "Aluno E2E", "aluno");

  if (withLink) {
    await query(
      "insert into public.student_teacher_links (student_id, teacher_id) values ($1, $2)",
      [student.id, teacher.id],
    );
  }
  await setAccess(student.id, access);

  const planId = randomUUID();
  const planName = `Plano E2E ${planId.slice(0, 8)}`;
  const blocks: ScenarioBlock[] = [];
  const goals: ScenarioGoal[] = [];

  if (withPlan) {
    await query(
      `insert into public.study_plans
         (id, student_id, teacher_id, name, area, target_exam, stage, study_model,
          weekly_goals, start_date, status)
       values ($1, $2, $3, $4, 'Policial', 'PCPR — Investigador', 'Pré-edital',
               'Avanço progressivo', 24, current_date, $5::public.study_plan_status)`,
      [planId, student.id, teacher.id, planName, planStatus],
    );

    for (const [index, catalogBlock] of CATALOG.blocks.entries()) {
      const id = randomUUID();
      await query(
        `insert into public.study_plan_blocks
           (id, study_plan_id, student_id, teacher_id, catalog_block_id,
            subject_name, subject_color, subject_target, name, question_count,
            subject_order, block_order)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, 30, $10, 0)`,
        [
          id,
          planId,
          student.id,
          teacher.id,
          catalogBlock.id,
          catalogBlock.subjectName,
          catalogBlock.subjectColor,
          subjectTarget,
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
      // Pela RPC real, impersonando o professor: se uma regra de negócio de
      // planejamento regredir, o cenário falha aqui em vez de produzir dado
      // que nenhuma tela consegue explicar. Mesmo caminho do seed.
      await asUser(teacher.id, (client) =>
        client.query(
          `select public.apply_study_plan_batch($1::uuid, $2::uuid, 1::smallint,
                                                'append'::public.batch_mode, $3::jsonb)`,
          [
            randomUUID(),
            planId,
            JSON.stringify(weekOneGoals(blocks.map((b) => b.id), planId.slice(0, 8))),
          ],
        ),
      );

      const rows = await query<{
        id: string;
        type: ScenarioGoal["type"];
        title: string;
        weekday: number;
        block_id: string | null;
      }>(
        `select id, type, title, weekday, block_id
           from public.goals
          where study_plan_id = $1 and deleted_at is null
          order by week_number, weekday, day_order`,
        [planId],
      );
      goals.push(
        ...rows.map((row) => ({
          id: row.id,
          type: row.type,
          title: row.title,
          weekday: row.weekday,
          blockId: row.block_id,
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
  const goals = scenario.blocks.map((block, index) => ({
    weekday: index + 1,
    position: 1,
    type: "question_block",
    block_id: block.id,
    title: `Bateria semana ${week} — ${block.subjectName} · ${scenario.planId.slice(0, 8)}`,
    planned_minutes: 90,
  }));

  await asUser(scenario.teacher.id, (client) =>
    client.query(
      `select public.apply_study_plan_batch($1::uuid, $2::uuid, $3::smallint,
                                            'append'::public.batch_mode, $4::jsonb)`,
      [randomUUID(), scenario.planId, week, JSON.stringify(goals)],
    ),
  );

  const rows = await query<{
    id: string;
    type: ScenarioGoal["type"];
    title: string;
    weekday: number;
    block_id: string | null;
  }>(
    `select id, type, title, weekday, block_id
       from public.goals
      where study_plan_id = $1 and week_number = $2 and deleted_at is null
      order by weekday, day_order`,
    [scenario.planId, week],
  );

  return rows.map((row) => ({
    id: row.id,
    type: row.type,
    title: row.title,
    weekday: row.weekday,
    blockId: row.block_id,
  }));
}

// ---------------------------------------------------------------------------
// Leituras de conferência
// ---------------------------------------------------------------------------

export interface QuizSessionRow extends Record<string, unknown> {
  readonly id: string;
  readonly status: string;
  readonly session_number: number;
  readonly main_target: number;
  readonly duration_minutes: number | null;
  readonly goal_id: string | null;
}

/**
 * Bateria mais recente do planejamento.
 *
 * Ordena por `execution_sequence`, não por data: a tabela não tem `created_at`,
 * e duas baterias criadas no mesmo instante — o que acontece num teste —
 * empatariam em `started_at`. `execution_sequence` é sequencial por construção.
 */
export async function openSessionOf(planId: string): Promise<QuizSessionRow | null> {
  const rows = await query<QuizSessionRow>(
    `select id, status, session_number, main_target, duration_minutes, goal_id
       from public.quiz_sessions
      where study_plan_id = $1
      order by execution_sequence desc
      limit 1`,
    [planId],
  );
  return rows[0] ?? null;
}

export async function goalStatus(goalId: string): Promise<string> {
  return value<string>("select status::text from public.goals where id = $1", [goalId]);
}

/**
 * Questões do bloco do catálogo, na ordem em que o site as envia.
 *
 * Traz o tópico desde o protocolo 2: é o que permite à extensão escolher a
 * correlata do mesmo tópico.
 */
export async function catalogQuestions(catalogBlockId: string): Promise<AvailableQuestion[]> {
  const rows = await query<{ question_id: string; topic: string }>(
    `select question_id, topic from public.catalog_questions
      where block_id = $1 order by position`,
    [catalogBlockId],
  );
  return rows.map((row) => ({ id: Number(row.question_id), topic: row.topic }));
}

export async function ledgerCount(quizSessionId: string): Promise<number> {
  return Number(
    await value<string>("select count(*) from public.quiz_session_questions where quiz_session_id = $1", [
      quizSessionId,
    ]),
  );
}

export async function goalPerformance(
  goalId: string,
): Promise<{ answered: number; correct: number; minutes: number | null } | null> {
  const rows = await query<{
    questions_answered: string | null;
    correct_answers: string | null;
    minutes_spent: string | null;
  }>(
    `select questions_answered, correct_answers, minutes_spent
       from public.vw_goal_performance where goal_id = $1`,
    [goalId],
  );
  const first = rows[0];
  if (!first) return null;
  return {
    answered: Number(first.questions_answered ?? 0),
    correct: Number(first.correct_answers ?? 0),
    minutes: first.minutes_spent === null ? null : Number(first.minutes_spent),
  };
}

/** Marca a semana como já tendo baterias concluídas, para a tela de Revisões. */
export async function planWeeks(planId: string): Promise<number[]> {
  const rows = await query<{ week_number: number }>(
    `select distinct week_number from public.goals
      where study_plan_id = $1 and deleted_at is null order by week_number`,
    [planId],
  );
  return rows.map((row) => row.week_number);
}

export async function goalCount(planId: string): Promise<number> {
  return Number(
    await value<string>(
      "select count(*) from public.goals where study_plan_id = $1 and deleted_at is null",
      [planId],
    ),
  );
}

/**
 * Cadernos extras numa disciplina do planejamento.
 *
 * A grade de revisão espaçada só tem o que mostrar com vários cadernos na mesma
 * disciplina, e o cenário padrão cria um por disciplina. Os novos entram DEPOIS
 * do que já existe, em `block_order` crescente, que é a ordem que a grade usa.
 */
export async function addBlocks(
  scenario: Scenario,
  subjectName: string,
  count: number,
): Promise<readonly string[]> {
  const base = await query<{ max: string | null }>(
    `select max(block_order)::text as max from public.study_plan_blocks
      where study_plan_id = $1 and subject_name = $2 and deleted_at is null`,
    [scenario.planId, subjectName],
  );
  const start = Number(base[0]?.max ?? -1) + 1;

  const order = await query<{ subject_order: number }>(
    `select subject_order from public.study_plan_blocks
      where study_plan_id = $1 and subject_name = $2 limit 1`,
    [scenario.planId, subjectName],
  );
  const subjectOrder = order[0]?.subject_order ?? 0;

  const ids: string[] = [];
  for (let i = 0; i < count; i += 1) {
    const id = randomUUID();
    await query(
      `insert into public.study_plan_blocks
         (id, study_plan_id, student_id, teacher_id, subject_name, name,
          subject_order, block_order)
       values ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        id,
        scenario.planId,
        scenario.student.id,
        scenario.teacher.id,
        subjectName,
        `Aula ${start + i + 1}`,
        subjectOrder,
        start + i,
      ],
    );
    ids.push(id);
  }
  return ids;
}

/** Espaçamento definido pelo professor, pelo caminho real: escrita com RLS. */
export async function setSpacing(
  scenario: Scenario,
  subjectName: string,
  first: number,
  second: number,
): Promise<void> {
  await asUser(scenario.teacher.id, (client) =>
    client.query(
      `insert into public.review_spacings
         (study_plan_id, student_id, teacher_id, subject_name, first_interval, second_interval)
       values ($1, $2, $3, $4, $5, $6)`,
      [scenario.planId, scenario.student.id, scenario.teacher.id, subjectName, first, second],
    ),
  );
}

/** Marcações vivas do planejamento, na forma `${blockId}:${ordinal}`. */
export async function reviewsDone(planId: string): Promise<readonly string[]> {
  const rows = await query<{ study_plan_block_id: string; ordinal: number }>(
    `select study_plan_block_id, ordinal from public.review_completions
      where study_plan_id = $1 and deleted_at is null`,
    [planId],
  );
  return rows.map((row) => `${row.study_plan_block_id}:${row.ordinal}`);
}
