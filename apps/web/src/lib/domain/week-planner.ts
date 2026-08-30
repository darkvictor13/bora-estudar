import type { Enum } from "@bora/database";

export interface PlannerBlock {
  readonly id: string;
  readonly name: string;
  readonly subject_name: string;
}

/**
 * Rascunho de meta no formato que `apply_study_plan_batch` espera.
 *
 * A assinatura de índice existe para o tipo casar com `Json` do supabase-js,
 * que é o tipo do parâmetro `p_goals` da RPC.
 */
export interface GoalDraft {
  [key: string]: string | number | null;
  weekday: number;
  position: number;
  type: Enum<"goal_type">;
  block_id: string | null;
  title: string;
  planned_minutes: number;
  teacher_note: string | null;
  extra_activity: string | null;
}

/** Teto de metas por semana. É o da v96 (`#am-total-metas`, máximo 80). */
export const MAX_WEEK_GOALS = 80;
/** Teto de peso por disciplina. */
export const MAX_SUBJECT_WEIGHT = 20;

export interface PlannerSubject {
  readonly name: string;
  /** Blocos marcados desta disciplina, na ordem do planejamento. */
  readonly blocks: readonly PlannerBlock[];
  /** Quanto a disciplina pesa na semana. `0` a tira dela por completo. */
  readonly weight: number;
  /**
   * Metas de bateria que a disciplina já tem no planejamento, somando todas as
   * semanas. É o ponto de partida do rodízio de blocos (R-PREV-08).
   */
  readonly used: number;
}

/**
 * Reparte `total` metas entre as disciplinas, proporcional ao peso.
 *
 * É o algoritmo da v96 (`calcularDistribuicaoPadraoBlocos`, professor.js:5006):
 *
 *   1. `ideal = total × peso ÷ soma dos pesos`, e o piso de cada um;
 *   2. quando `total ≥ nº de disciplinas`, **cada uma recebe ao menos 1** — uma
 *      matéria que sumisse da semana inteira é o oposto do que o peso diz;
 *   3. o que sobrar vai para os **maiores restos fracionários**.
 *
 * Peso `0` é "fora desta semana", não "peso mínimo": a disciplina fica de fora
 * inclusive do mínimo do passo 2 (R-PREV-04).
 *
 * O empate no resto é resolvido pela ORDEM da disciplina, nunca por sorteio: a
 * mesma entrada precisa produzir a mesma semana, senão a prévia mente e o
 * `batch_id` derivado do conteúdo deixa de valer.
 */
export function distributeByWeight(
  subjects: readonly { readonly name: string; readonly weight: number }[],
  total: number,
): Map<string, number> {
  const result = new Map<string, number>(subjects.map((s) => [s.name, 0]));
  if (total <= 0 || !subjects.length) return result;

  const eligible = subjects.filter((s) => s.weight > 0);

  // Todos os pesos zerados: rodízio simples, uma por disciplina até esgotar.
  // É degradação previsível, não erro (R-PREV-05).
  if (!eligible.length) {
    for (let i = 0; i < total; i += 1) {
      const subject = subjects[i % subjects.length]!;
      result.set(subject.name, (result.get(subject.name) ?? 0) + 1);
    }
    return result;
  }

  const sum = eligible.reduce((acc, s) => acc + s.weight, 0);
  const shares = eligible.map((subject, index) => {
    const ideal = (total * subject.weight) / sum;
    const base = Math.floor(ideal);
    return { name: subject.name, index, base, rest: ideal - base };
  });

  // Mínimo 1 por disciplina elegível, quando o total comporta.
  if (total >= eligible.length) {
    for (const share of shares) if (share.base === 0) share.base = 1;
  }

  let allocated = shares.reduce((acc, s) => acc + s.base, 0);

  // O piso mais o mínimo podem ter estourado o total: devolve das que mais têm,
  // e nunca abaixo de 1 enquanto o mínimo estiver valendo.
  const floor = total >= eligible.length ? 1 : 0;
  while (allocated > total) {
    const candidates = shares.filter((s) => s.base > floor);
    if (!candidates.length) break;
    const maior = candidates.reduce((a, b) =>
      b.base > a.base || (b.base === a.base && b.rest < a.rest) ? b : a,
    );
    maior.base -= 1;
    allocated -= 1;
  }

  // O que sobrou vai para os maiores restos. Empate: menor índice primeiro.
  const porResto = [...shares].sort((a, b) => b.rest - a.rest || a.index - b.index);
  let sobra = total - allocated;
  for (let i = 0; sobra > 0; i = (i + 1) % porResto.length) {
    porResto[i]!.base += 1;
    sobra -= 1;
  }

  for (const share of shares) result.set(share.name, share.base);
  return result;
}

/**
 * Monta a semana a partir das disciplinas, dos pesos e dos dias.
 *
 * Duas ordenações compõem o resultado:
 *
 *  - **dentro da disciplina**, os blocos entram em rodízio `B1 → B2 → … → B1`,
 *    começando de onde a semana anterior parou (`used`). É a regra da v82, e é
 *    o que impede a semana de martelar o mesmo bloco;
 *  - **entre disciplinas**, uma meta de cada por vez, na ordem do planejamento.
 *    É o que espalha as matérias pelos dias em vez de empilhar uma só num dia.
 *
 * `position` é relativa dentro do dia e começa em 1. A RPC soma o maior
 * `day_order` sobrevivente daquele dia antes de gravar, então gerar duas vezes
 * a mesma semana no modo "acrescentar" não colide — quem resolve a ordem final
 * é o banco, nunca o cliente.
 */
export function buildWeek(
  subjects: readonly PlannerSubject[],
  weekdays: readonly number[],
  minutesPerGoal: number,
  withTheory: boolean,
  total: number,
): GoalDraft[] {
  const withBlocks = subjects.filter((s) => s.blocks.length > 0);
  if (!withBlocks.length || !weekdays.length) return [];

  const allocation = distributeByWeight(withBlocks, total);

  // Fila intercalada: uma meta de cada disciplina por rodada.
  const pending = withBlocks.map((subject) => ({
    subject,
    left: allocation.get(subject.name) ?? 0,
    taken: 0,
  }));

  const sequence: { subject: PlannerSubject; block: PlannerBlock }[] = [];
  let restam = pending.reduce((acc, p) => acc + p.left, 0);
  while (restam > 0) {
    for (const entry of pending) {
      if (entry.left === 0) continue;
      const blocks = entry.subject.blocks;
      const index = (entry.subject.used + entry.taken) % blocks.length;
      sequence.push({ subject: entry.subject, block: blocks[index]! });
      entry.left -= 1;
      entry.taken += 1;
      restam -= 1;
    }
  }

  const drafts: GoalDraft[] = [];
  const nextPosition = new Map<number, number>();
  const take = (weekday: number) => {
    const position = (nextPosition.get(weekday) ?? 0) + 1;
    nextPosition.set(weekday, position);
    return position;
  };

  sequence.forEach(({ subject, block }, index) => {
    const weekday = weekdays[index % weekdays.length]!;

    if (withTheory) {
      drafts.push({
        weekday,
        position: take(weekday),
        type: "theory",
        block_id: null,
        title: `Teoria — ${subject.name}`,
        planned_minutes: minutesPerGoal,
        teacher_note: null,
        extra_activity: null,
      });
    }

    drafts.push({
      weekday,
      position: take(weekday),
      type: "question_block",
      block_id: block.id,
      title: `Bateria — ${block.name}`,
      planned_minutes: minutesPerGoal,
      teacher_note: null,
      extra_activity: null,
    });
  });

  return drafts;
}

/**
 * Agrupa os blocos marcados por disciplina, preservando a ordem em que vieram.
 *
 * A ordem importa duas vezes: ela decide o desempate da repartição e a ordem do
 * rodízio entre disciplinas. Quem a define é o `order("subject_order")` da
 * consulta, não esta função.
 */
export function groupIntoSubjects(
  blocks: readonly PlannerBlock[],
  weightOf: (subject: string) => number,
  usedOf: (blockId: string) => number,
): PlannerSubject[] {
  const order: string[] = [];
  const byName = new Map<string, PlannerBlock[]>();

  for (const block of blocks) {
    if (!byName.has(block.subject_name)) {
      byName.set(block.subject_name, []);
      order.push(block.subject_name);
    }
    byName.get(block.subject_name)!.push(block);
  }

  return order.map((name) => {
    const list = byName.get(name)!;
    return {
      name,
      blocks: list,
      weight: weightOf(name),
      // O ponto de partida do rodízio é quanto a disciplina inteira já rodou.
      used: list.reduce((acc, block) => acc + usedOf(block.id), 0),
    };
  });
}
