import { supabase } from "@/lib/supabase/client";
import { requireRole, requireSession } from "@/lib/auth/session";
import type { FormState } from "@/lib/auth/actions";
import { ROUTES } from "@/lib/routes";

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

/**
 * Resgata um cupom de acesso — spec 30.
 *
 * O `request_id` vem do formulário, gerado UMA vez na carga da tela. Gerá-lo
 * aqui transformaria a proteção do servidor em decoração: cada tentativa
 * chegaria ao banco como resgate novo e consumiria outro uso do cupom.
 */
export async function redeemCoupon(_prev: FormState, data: FormData): Promise<FormState> {
  await requireRole("student");

  const code = text(data, "code");
  const requestId = text(data, "requestId");
  if (!code) return { error: "Informe o código do cupom." };
  if (!requestId) return { error: "Recarregue a página e tente de novo." };

  const { error } = await supabase.rpc("redeem_coupon", {
    p_code: code,
    p_request_id: requestId,
  });

  if (error) {
    const m = error.message.toLowerCase();
    // A mesma resposta para inexistente, inativo, vencido e esgotado: a RPC não
    // distingue, e a tela não pode distinguir mais que ela.
    if (m.includes("cupom invalido")) return { error: "Cupom inválido ou expirado." };
    if (m.includes("ja tem acesso")) return { error: "Seu acesso já está liberado." };
    if (m.includes("ja usou este cupom")) return { error: "Você já usou este cupom." };
    if (m.includes("ja utilizado com outro payload")) {
      return { error: "Recarregue a página antes de tentar outro código." };
    }
    return { error: error.message };
  }

  // O aviso de acesso e o formulário mudam com a revalidação, e levariam junto
  // a mensagem: quem anuncia é a página.
  return { redirectTo: `${ROUTES.student.waitlist}?feito=cupom` };
}
