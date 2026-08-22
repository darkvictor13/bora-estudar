"use server";

import { revalidatePath } from "next/cache";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth/session";
import { ROUTES } from "@/lib/routes";
import type { FormState } from "@/lib/auth/actions";

function text(data: FormData, field: string): string {
  return String(data.get(field) ?? "").trim();
}

export async function updateProfile(_prev: FormState, data: FormData): Promise<FormState> {
  const session = await requireRole("student");
  const name = text(data, "name");
  if (name.length < 3) return { error: "Informe seu nome completo." };

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase
    .from("profiles")
    .update({ name, phone: text(data, "phone") || null })
    .eq("id", session.profileId);

  if (error) return { error: `Não foi possível salvar: ${error.message}` };

  revalidatePath(ROUTES.student.account);
  revalidatePath("/", "layout");
  return { success: "Dados atualizados." };
}

export async function saveWaitlistEntry(_prev: FormState, data: FormData): Promise<FormState> {
  const session = await requireRole("student");

  const whatsapp = text(data, "whatsapp");
  const interestArea = text(data, "interestArea");
  const focusExam = text(data, "focusExam");
  if (!whatsapp || !interestArea || !focusExam) {
    return { error: "Informe WhatsApp, área de interesse e concurso em foco." };
  }

  const supabase = await createServerSupabaseClient();
  const birthDate = text(data, "birthDate");

  const { error } = await supabase.from("waitlist").upsert(
    {
      student_id: session.profileId,
      name: session.name,
      email: session.user.email ?? "",
      whatsapp,
      interest_area: interestArea,
      focus_exam: focusExam,
      timezone: text(data, "timezone") || null,
      birth_date: birthDate || null,
    },
    { onConflict: "student_id" },
  );

  if (error) return { error: `Não foi possível salvar: ${error.message}` };

  revalidatePath(ROUTES.student.waitlist);
  return { success: "Cadastro salvo. Você está na lista de espera." };
}
