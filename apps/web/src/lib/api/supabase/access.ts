/**
 * Lista de espera e cupom — o caminho de quem ainda não tem acesso.
 *
 * ## O CUPOM NÃO TEM COMO SER RESGATADO NESTE SCHEMA
 *
 * `coupons` está com RLS ligada, ZERO policy e ZERO grant: nem o aluno nem o
 * professor a enxergam pela API. É a decisão certa — validar código de cupom no
 * cliente é entregar a lista de códigos a quem pedir —, e a consequência é que
 * o resgate precisa nascer como RPC, rodando como definer. O de-para registra
 * isso, e `redeemCoupon` aqui recusa dizendo exatamente o que falta em vez de
 * fingir que tentou.
 */
import { supabase } from "@/lib/supabase/client";

import type { Result, Session, WaitlistEntry, WaitlistInput } from "../contract.ts";
import { fail, done, failure, throwDb, translateDbError } from "./errors.ts";
import { requireSession } from "./session.ts";

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

export async function joinWaitlist(input: WaitlistInput): Promise<Result<WaitlistEntry>> {
  const session = await requireSession();

  if (input.name.trim().length < 3) {
    return fail("validation", "Informe seu nome completo.", "name");
  }
  if (!input.whatsapp.trim()) {
    return fail("validation", "Informe um WhatsApp para o professor falar com você.", "whatsapp");
  }
  if (!input.targetExam.trim()) {
    return fail("validation", "Informe para qual concurso você estuda.", "targetExam");
  }
  if (!session.teacherId) {
    return fail(
      "conflict",
      "Sua conta ainda não está vinculada a um professor. Aguarde o contato.",
    );
  }

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
        teacher_id: session.teacherId,
      });

  if (error) return failure(translateDbError(error));

  const fresh = await loadWaitlistEntry();
  if (!fresh) return fail("unknown", "A inscrição não foi gravada.");
  return done(fresh);
}

/**
 * O resgate de cupom, que este schema não permite.
 *
 * Lança em vez de devolver `Result` porque não é erro de uso — é operação que
 * não existe. Uma recusa educada faria a tela oferecer o campo e culpar quem
 * digitou o código certo.
 */
export function redeemCoupon(): Promise<Result<Session>> {
  throw new Error(
    "O resgate de cupom precisa nascer como RPC: `coupons` está sem policy e sem grant, " +
      "de propósito — validar o código no cliente entregaria a lista de códigos. " +
      "Ver docs/de-para-schema.md, seção Funções e gatilhos.",
  );
}
