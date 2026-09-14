import Button from "@mui/material/Button";
import Link from "@mui/material/Link";
import { Field } from "@bora/ui";
import { Link as RouterLink, redirect } from "react-router";

import { AuthForm } from "@/components/auth/AuthForm";
import { AuthView } from "@/components/auth/AuthView";
import { signIn } from "@/lib/auth/actions";
import { getSessionContext } from "@/lib/auth/session";
import { ROUTES, homeForRole } from "@/lib/routes";

export async function signInLoader() {
  const session = await getSessionContext();
  if (session) throw redirect(homeForRole(session.role));
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
