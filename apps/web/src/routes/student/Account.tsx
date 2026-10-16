import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Link from "@mui/material/Link";
import Typography from "@mui/material/Typography";
import { Alert, Badge, Card, Field, PageHeader } from "@bora/ui";
import { useState } from "react";
import { Link as RouterLink, useLoaderData, useNavigate, useRevalidator } from "react-router";

import { ContentBody } from "@/components/AppShell";
import { DeleteAccountDialog, DeletionSummary } from "@/components/student/DeleteAccountDialog";
import { api, MAX_NAME_LENGTH, type Account as AccountData, type ApiError } from "@/lib/api";
import { requireSession } from "@/lib/auth/session";
import { formatInstant } from "@/lib/domain/dates";
import { ROUTES } from "@/lib/routes";
import { forgetTheme } from "@/lib/theme";

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
export async function accountLoader({ request }: { request: Request }) {
  const session = await requireSession(request);
  // O papel vem junto: a mesma tela serve as duas rotas, com texto por papel
  // (R-CONTA-01, R-CONTA-09).
  return { account: await api.loadAccount(), role: session.role };
}

type LoaderData = Awaited<ReturnType<typeof accountLoader>>;

const ACCESS_LABEL: Record<AccountData["access"], { label: string; tone: "success" | "warning" | "error" | "neutral" }> = {
  active: { label: "Liberado", tone: "success" },
  pending: { label: "Aguardando liberação", tone: "warning" },
  suspended: { label: "Suspenso", tone: "error" },
  expired: { label: "Vencido", tone: "error" },
};

export function Account() {
  const { account, role } = useLoaderData() as LoaderData;
  const isTeacher = role === "teacher";
  const { revalidate } = useRevalidator();
  const [error, setError] = useState<ApiError | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, setPending] = useState(false);
  const navigate = useNavigate();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<ApiError | null>(null);

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

  /**
   * Excluir a conta (spec 46). Sucesso encerra a sessão deste aparelho (o
   * adaptador já limpou os cookies) e leva ao login com a mensagem; falha
   * fica no diálogo, SEM sair — a RPC é segura para tentar de novo.
   */
  async function deleteAccount() {
    setDeleting(true);
    setDeleteError(null);
    const result = await api.deleteAccount();
    setDeleting(false);
    if (!result.ok) {
      setDeleteError(result.error);
      return;
    }
    forgetTheme();
    await navigate(`${ROUTES.signIn}?conta=excluida`, { replace: true });
  }

  return (
    <>
      <PageHeader
        title="Meus dados"
        description={isTeacher ? "Como os seus alunos veem você" : "O que o seu professor vê sobre você"}
      />

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
              maxLength={MAX_NAME_LENGTH}
              invalid={error?.field === "name"}
            />

            {/*
              O e-mail é a identidade da conta no GoTrue: trocá-lo é trocar o
              login, e passa por confirmação nos dois endereços. Mostrar o campo
              aqui prometeria algo que esta tela não faz.
            */}
            <Field label="E-mail" name="email" value={account.email} disabled readOnly
              hint={
                isTeacher
                  ? "É o seu login. A troca de e-mail ainda não está disponível."
                  : "Para trocar o e-mail de acesso, fale com seu professor."
              } />

            <Button type="submit" variant="contained" disabled={pending}>
              {pending ? "Salvando…" : "Salvar"}
            </Button>
          </Box>
        </Card>

        {/* Vigência e professor são do ALUNO (R-CONTA-09): o professor não tem nenhum dos dois. */}
        {!isTeacher && (
        <Box sx={{ mt: 1.75 }}>
          <Card title="Acesso" action={<Badge tone={access.tone}>{access.label}</Badge>}>
            <Box
              component="dl"
              data-testid="account-access"
              sx={(theme) => ({
                display: "grid",
                gridTemplateColumns: "repeat(3, 1fr)",
                gap: 2,
                m: 0,
                [theme.breakpoints.down("lg")]: { gridTemplateColumns: "minmax(0, 1fr)" },
              })}
            >
              {(
                [
                  ["Professor", account.teacherName ?? "Ainda sem professor"],
                  ["Plano", account.plan ?? "—"],
                  ["Válido até", account.accessExpiresAt ? formatInstant(account.accessExpiresAt) : "sem prazo"],
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
        )}

        {/* O aluno apaga a própria conta; o professor não (R-LGPD-09, R-LGPD-12). */}
        {!isTeacher && (
          <Box sx={{ mt: 1.75 }}>
            <Card title="Excluir conta">
              <Box data-testid="delete-account-card">
                <DeletionSummary />
                <Button
                  type="button"
                  variant="outlined"
                  color="error"
                  onClick={() => {
                    setDeleteError(null);
                    setDeleteOpen(true);
                  }}
                  data-testid="delete-account-open"
                >
                  Excluir minha conta…
                </Button>
              </Box>
            </Card>
            <DeleteAccountDialog
              open={deleteOpen}
              pending={deleting}
              error={deleteError}
              onCancel={() => setDeleteOpen(false)}
              onConfirm={() => void deleteAccount()}
            />
          </Box>
        )}

        <Typography variant="caption" component="p" sx={{ mt: 2, display: "flex", gap: 2 }}>
          <Link component={RouterLink} to={ROUTES.privacy} data-testid="legal-link-privacy">Política de privacidade</Link>
          <Link component={RouterLink} to={ROUTES.terms} data-testid="legal-link-terms">Termos de uso</Link>
        </Typography>
      </ContentBody>
    </>
  );
}
