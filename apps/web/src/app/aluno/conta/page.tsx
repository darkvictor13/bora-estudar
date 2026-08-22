import type { Metadata } from "next";

import { Card, PageHeader } from "@/components/ui";
import { AuthForm } from "@/components/auth/AuthForm";
import { Field } from "@/components/ui";
import { requireRole } from "@/lib/auth/session";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { updateProfile } from "@/lib/data/account-actions";

export const metadata: Metadata = { title: "Meus dados · Bora Estudar" };

export default async function StudentAccountPage() {
  const session = await requireRole("student");

  const supabase = await createServerSupabaseClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("name,phone,contact_email")
    .eq("id", session.profileId)
    .maybeSingle();

  return (
    <>
      <PageHeader title="Meus dados" description="Estes dados aparecem para o seu professor." />

      <Card>
        <AuthForm action={updateProfile} submitLabel="Salvar alterações" pendingLabel="Salvando…">
          <Field label="Nome completo" name="name" defaultValue={profile?.name ?? ""} required minLength={3} />
          <Field label="WhatsApp" name="phone" defaultValue={profile?.phone ?? ""} placeholder="(00) 00000-0000" />
          <div className="field">
            {/* <label for> de verdade: um <span> solto não é anunciado por
                leitor de tela como rótulo do campo. */}
            <label className="field__label" htmlFor="field-contactEmail">
              E-mail de acesso
            </label>
            <input
              id="field-contactEmail"
              value={profile?.contact_email ?? session.user.email ?? ""}
              readOnly
              disabled
            />
            <span className="field__hint">Para trocar o e-mail, fale com o professor.</span>
          </div>
        </AuthForm>
      </Card>
    </>
  );
}
