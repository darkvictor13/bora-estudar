import { supabase } from "@/lib/supabase/client";
import { requireRole, requireSession } from "@/lib/auth/session";
import type { FormState } from "@/lib/auth/actions";

function text(data: FormData, field: string): string {
  return String(data.get(field) ?? "").trim();
}

/**
 * Nome e telefone do próprio usuário — spec 27.
 *
 * Exige SESSÃO, não papel. Quem decide o que pode ser escrito é a RLS, que
 * limita a linha a `id = auth.uid()`, mais o grant por coluna, que reduz a
 * escrita a `name` e `phone`. O papel nunca foi o que protegia isto — era só o
 * que impedia o professor de corrigir o próprio nome.
 */
export async function updateProfile(_prev: FormState, data: FormData): Promise<FormState> {
  const session = await requireSession();
  const name = text(data, "name");
  if (name.length < 3) return { error: "Informe seu nome completo." };

  const { error } = await supabase
    .from("profiles")
    .update({ name, phone: text(data, "phone") || null })
    .eq("id", session.profileId);

  if (error) return { error: `Não foi possível salvar: ${error.message}` };

  // A revalidação que `useFormActionState` dispara ao ver `success` re-roda os
  // loaders de TODAS as rotas casadas, incluindo o do layout — que é quem
  // alimenta o nome na sidebar. É o equivalente exato do
  // `revalidatePath("/", "layout")` que estava aqui.
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

  return { success: "Cadastro salvo. Você está na lista de espera." };
}
