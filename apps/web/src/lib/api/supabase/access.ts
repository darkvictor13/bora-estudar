/**
 * Lista de espera e cupom — o caminho de quem ainda não tem acesso.
 *
 * O cupom é resgatado por RPC (`redeem_coupon`, spec 30): `coupons` tem RLS
 * ligada, zero policy e zero grant, de propósito — validar o código no cliente
 * entregaria a lista de códigos a quem pedisse.
 */
import { supabase } from "@/lib/supabase/client";

import type { Result, Session, WaitlistEntry, WaitlistInput } from "../contract.ts";
import { checkCoupon, checkWaitlist } from "../validation.ts";
import { fail, done, failure, throwDb, settle, translateDbError } from "./errors.ts";
import { currentSession, requireSession, today } from "./session.ts";

const WAITLIST_COLUMNS =
  "student_id,name,email,whatsapp,interest_area,target_exam,timezone,birth_date,status,created_at";

interface WaitlistRow {
  student_id: string;
  name: string;
  email: string;
  whatsapp: string;
  interest_area: string;
  target_exam: string;
  timezone: string;
  birth_date: string | null;
  status: WaitlistEntry["status"];
  created_at: string;
}

function toEntry(row: WaitlistRow): WaitlistEntry {
  return {
    studentId: row.student_id,
    name: row.name,
    email: row.email,
    whatsapp: row.whatsapp,
    interestArea: row.interest_area,
    targetExam: row.target_exam,
    timezone: row.timezone,
    ...(row.birth_date ? { birthDate: row.birth_date } : {}),
    status: row.status,
    createdAt: row.created_at,
  };
}

export async function loadWaitlistEntry(): Promise<WaitlistEntry | null> {
  const session = await requireSession();

  const { data, error } = await supabase
    .from("waitlist")
    .select(WAITLIST_COLUMNS)
    .eq("student_id", session.profileId)
    .maybeSingle();

  if (error) throwDb(error);
  return data ? toEntry(data as WaitlistRow) : null;
}

export function joinWaitlist(input: WaitlistInput): Promise<Result<WaitlistEntry>> {
  return settle(async () => {
    const session = await requireSession();

    // A mesma faixa do banco (R-CTA-07): WhatsApp com 10 a 13 dígitos, área e
    // concurso preenchidos, nascimento entre 1900 e hoje (do aparelho, D-11).
    const invalid = checkWaitlist(input, today());
    if (invalid) return failure<WaitlistEntry>(invalid);

    const values = {
      name: input.name.trim(),
      email: input.email.trim(),
      whatsapp: input.whatsapp.trim(),
      interest_area: input.interestArea.trim(),
      target_exam: input.targetExam.trim(),
      timezone: input.timezone,
      birth_date: input.birthDate ?? null,
    };

    const existing = await loadWaitlistEntry();

    // Sem `upsert`, e pelo mesmo motivo de `theory_progress`: as colunas de
    // IDENTIDADE (`student_id`, `teacher_id`) ficam fora do grant de UPDATE, e o
    // `ON CONFLICT DO UPDATE` do PostgREST as manda junto.
    const { error } = existing
      ? await supabase.from("waitlist").update(values).eq("student_id", session.profileId)
      : await supabase.from("waitlist").insert({
          ...values,
          student_id: session.profileId,
          // NULO É O CASO NORMAL, e não falta de dado: o perfil nasce sem
          // professor (migration 20260914190000), e esta fila é justamente a de
          // quem ainda não tem um. A policy `waitlist_insert_student` compara o
          // par com `is not distinct from`, então nulo casa com nulo.
          teacher_id: session.teacherId,
        });

    if (error) return failure(translateDbError(error));

    const fresh = await loadWaitlistEntry();
    if (!fresh) return fail("unknown", "A inscrição não foi gravada.");
    return done(fresh);
  });
}

/**
 * O resgate de cupom (spec 30): uma RPC que valida o código, concede o acesso e
 * registra o resgate numa transação só. O cliente NUNCA vê a lista de códigos —
 * `coupons` não tem policy nem grant —, e é o único caminho em que o próprio
 * aluno altera o próprio acesso.
 *
 * A recusa de regra (código inválido, já usado, acesso já liberado) chega como
 * `P0001`, com a frase já pronta em português e a MESMA para inexistente,
 * inativo, vencido e esgotado (R-CUP-04). Aqui ela vira `validation` com o campo
 * `coupon`, porque é a entrada que a pessoa digitou. Os outros códigos seguem a
 * tradução comum.
 *
 * Devolve a sessão RELIDA: é o `access` novo que tira a tela do bloqueio.
 * Segura a retentativa — a RPC devolve o resultado anterior a quem já resgatou.
 */
export function redeemCoupon(code: string): Promise<Result<Session>> {
  return settle(async () => {
    const invalid = checkCoupon(code);
    if (invalid) return failure(invalid);
    await requireSession();

    const { error } = await supabase.rpc("redeem_coupon", { p_code: code });
    if (error) {
      const translated = translateDbError(error);
      return failure(
        error.code === "P0001"
          ? { code: "validation", message: translated.message, field: "coupon" }
          : translated,
      );
    }

    const session = await currentSession();
    if (!session) return fail("unauthenticated", "Sua sessão expirou. Entre de novo.");
    return done(session);
  });
}
