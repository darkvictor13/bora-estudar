import { useLoaderData } from "react-router";

import { Card, Field, PageHeader } from "@/components/ui";
import { AuthForm } from "@/components/auth/AuthForm";
import { requireRole } from "@/lib/auth/session";
import { supabase } from "@/lib/supabase/client";
import { updateProfile } from "@/lib/data/account-actions";

export async function accountLoader() {
  const session = await requireRole("student");

  const { data: profile } = await supabase
    .from("profiles")
    .select("name,phone,contact_email")
    .eq("id", session.profileId)
    .maybeSingle();

  return { profile, email: session.user.email ?? "" };
}

type LoaderData = Awaited<ReturnType<typeof accountLoader>>;

export function Account() {
  const { profile, email } = useLoaderData() as LoaderData;

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
              value={profile?.contact_email ?? email}
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
