import { useLoaderData } from "react-router";

import { Alert, Badge, Card, Field, PageHeader } from "@/components/ui";
import { AuthForm } from "@/components/auth/AuthForm";
import { requireRole } from "@/lib/auth/session";
import { getWaitlistEntry } from "@/lib/data/student";
import { saveWaitlistEntry } from "@/lib/data/account-actions";

export async function waitlistLoader() {
  const session = await requireRole("student");
  const entry = await getWaitlistEntry();
  return { hasAccess: session.hasAccess, entry };
}

type LoaderData = Awaited<ReturnType<typeof waitlistLoader>>;

export function Waitlist() {
  const { hasAccess, entry } = useLoaderData() as LoaderData;

  return (
    <>
      <PageHeader
        title="Lista de espera"
        description="Conte o que você está estudando para receber a oferta certa para o seu concurso."
      />

      {hasAccess ? (
        <Alert kind="success">Seu acesso já está liberado. Bons estudos.</Alert>
      ) : entry ? (
        <Alert kind="info">
          Você está na lista de espera <Badge tone="amber">{entry.status}</Badge>. Pode atualizar
          seus dados abaixo a qualquer momento.
        </Alert>
      ) : null}

      <Card>
        <AuthForm action={saveWaitlistEntry} submitLabel="Salvar cadastro" pendingLabel="Salvando…">
          <Field
            label="WhatsApp"
            name="whatsapp"
            defaultValue={entry?.whatsapp ?? ""}
            required
            placeholder="(00) 00000-0000"
          />
          <Field
            label="Área de interesse"
            name="interestArea"
            defaultValue={entry?.interest_area ?? ""}
            required
            placeholder="Policial, Fiscal, Tribunais…"
          />
          <Field
            label="Concurso em foco"
            name="focusExam"
            defaultValue={entry?.focus_exam ?? ""}
            required
            placeholder="PCPR — Investigador"
          />
          <Field
            label="Data de nascimento"
            name="birthDate"
            type="date"
            defaultValue={entry?.birth_date ?? ""}
          />
          <Field
            label="Fuso horário"
            name="timezone"
            defaultValue={entry?.timezone ?? ""}
            placeholder="America/Sao_Paulo"
          />
        </AuthForm>
      </Card>
    </>
  );
}
