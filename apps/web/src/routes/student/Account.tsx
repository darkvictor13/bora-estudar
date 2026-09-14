import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Typography from "@mui/material/Typography";
import { Alert, Badge, Card, Field, PageHeader } from "@bora/ui";
import { useState } from "react";
import { useLoaderData, useRevalidator } from "react-router";

import { ContentBody } from "@/components/AppShell";
import { api, type Account as AccountData, type ApiError } from "@/lib/api";
import { requireSession } from "@/lib/auth/session";

/**
 * Meus dados — o `p-meusDados` da v2.
 *
 * O NOME É O ÚNICO CAMPO EDITÁVEL, e não é economia de tela: `profiles` concede
 * `UPDATE (name)` e mais nada. Papel, situação de acesso, validade e professor
 * são contexto — a RLS decide qual linha, e o grant por coluna decide qual
 * coluna, justamente para que ninguém se promova a professor nem estenda o
 * próprio acesso. Mostrar campo editável para eles seria promessa que o banco
 * recusa.
 */
export async function accountLoader() {
  await requireSession();
  return { account: await api.loadAccount() };
}

type LoaderData = Awaited<ReturnType<typeof accountLoader>>;

const ACCESS_LABEL: Record<AccountData["access"], { label: string; tone: "success" | "warning" | "error" | "neutral" }> = {
  active: { label: "Liberado", tone: "success" },
  pending: { label: "Aguardando liberação", tone: "warning" },
  suspended: { label: "Suspenso", tone: "error" },
  expired: { label: "Vencido", tone: "error" },
};

function formatDate(date: string | null): string {
  if (!date) return "sem prazo";
  return `${date.slice(8, 10)}/${date.slice(5, 7)}/${date.slice(0, 4)}`;
}

export function Account() {
  const { account } = useLoaderData() as LoaderData;
  const { revalidate } = useRevalidator();
  const [error, setError] = useState<ApiError | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, setPending] = useState(false);

  const access = ACCESS_LABEL[account.access];

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);

    setPending(true);
    const result = await api.saveAccount({ name: String(data.get("name") ?? "") });
    setPending(false);

    if (!result.ok) {
      setError(result.error);
      setSaved(false);
      return;
    }
    setError(null);
    setSaved(true);
    await revalidate();
  }

  return (
    <>
      <PageHeader title="Meus dados" description="O que o seu professor vê sobre você" />

      <ContentBody>
        <Card title="Identificação">
          <Box component="form" noValidate onSubmit={save} data-testid="account-form">
            {error && <Alert status="error">{error.message}</Alert>}
            {saved && !error && <Alert status="success">Dados salvos.</Alert>}

            <Field
              label="Nome completo"
              name="name"
              defaultValue={account.name ?? ""}
              required
              invalid={error?.field === "name"}
            />

            {/*
              O e-mail é a identidade da conta no GoTrue: trocá-lo é trocar o
              login, e passa por confirmação nos dois endereços. Mostrar o campo
              aqui prometeria algo que esta tela não faz.
            */}
            <Field label="E-mail" name="email" value={account.email} disabled readOnly
              hint="Para trocar o e-mail de acesso, fale com seu professor." />

            <Button type="submit" variant="contained" disabled={pending}>
              {pending ? "Salvando…" : "Salvar"}
            </Button>
          </Box>
        </Card>

        <Box sx={{ mt: 1.75 }}>
          <Card title="Acesso" action={<Badge tone={access.tone}>{access.label}</Badge>}>
            <Box
              component="dl"
              sx={(theme) => ({
                display: "grid",
                gridTemplateColumns: "repeat(3, 1fr)",
                gap: 2,
                m: 0,
                [theme.breakpoints.down("lg")]: { gridTemplateColumns: "1fr" },
              })}
            >
              {(
                [
                  ["Professor", account.teacherName ?? "Ainda sem professor"],
                  ["Plano", account.plan ?? "—"],
                  ["Válido até", formatDate(account.accessExpiresAt)],
                ] as const
              ).map(([label, value]) => (
                <Box key={label}>
                  <Typography variant="metricLabel" component="dt">
                    {label}
                  </Typography>
                  <Typography component="dd" sx={{ m: 0, fontSize: "0.875rem", fontWeight: 500 }}>
                    {value}
                  </Typography>
                </Box>
              ))}
            </Box>
          </Card>
        </Box>
      </ContentBody>
    </>
  );
}
