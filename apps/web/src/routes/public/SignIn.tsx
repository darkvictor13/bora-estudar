import Button from "@mui/material/Button";
import Link from "@mui/material/Link";
import { Field } from "@bora/ui";
import { Link as RouterLink, redirect, useSearchParams } from "react-router";

import { AuthForm } from "@/components/auth/AuthForm";
import { AuthView } from "@/components/auth/AuthView";
import { signIn } from "@/lib/auth/actions";
import { getSessionContext } from "@/lib/auth/session";
import { ROUTES, homeForRole, safeInternalPath } from "@/lib/routes";

export async function signInLoader({ request }: { request: Request }) {
  const session = await getSessionContext();
  if (session) {
    // Quem já está logado e abre um link com `next` vai ao destino, pelo mesmo
    // filtro do login (R-AUTH-17): o padrão é a casa do papel real.
    const next = new URL(request.url).searchParams.get("next");
    throw redirect(safeInternalPath(next, homeForRole(session.role)));
  }
  return null;
}

/**
 * A entrada.
 *
 * A v2 tinha uma tela de BOAS-VINDAS antes desta, com dois caminhos: "Continuar
 * com Google" e "Entrar com e-mail e senha". O login com Google está bloqueado
 * neste produto — não há provedor configurado, e a auditoria da v96 registra o
 * porquê —, então aquela tela seria um passo a mais cujo único botão leva aqui.
 * O texto dela ("Bem-vindo de volta") fica, porque é a voz certa; o passo
 * extra, não.
 */
export function SignIn() {
  // O destino que a guarda pôs na URL. Vai num campo escondido para a action
  // lê-lo junto do e-mail e da senha; quem o filtra é `landAfterAuth`.
  const [params] = useSearchParams();
  const next = params.get("next") ?? "";

  return (
    <AuthView
      title="Bem-vindo de volta"
      description="Informe o e-mail e a senha cadastrados."
      footer={
        <>
          Não possui conta?{" "}
          <Link component={RouterLink} to={ROUTES.signUp} fontWeight={700}>
            Crie a sua, é grátis!
          </Link>
        </>
      }
    >
      <AuthForm action={signIn} submitLabel="Entrar" pendingLabel="Entrando…">
        {(state) => (
          <>
            <input type="hidden" name="next" value={next} />
            <Field
              label="E-mail"
              name="email"
              type="email"
              autoComplete="username"
              placeholder="seu@email.com"
              required
              invalid={state.field === "email" && Boolean(state.error)}
            />
            <Field
              label="Senha"
              name="password"
              type="password"
              autoComplete="current-password"
              placeholder="Digite sua senha"
              required
            />
          </>
        )}
      </AuthForm>

      <Button
        component={RouterLink}
        to={ROUTES.forgotPassword}
        variant="text"
        size="small"
        fullWidth
        sx={{ mt: 1 }}
      >
        Esqueci minha senha
      </Button>
    </AuthView>
  );
}
