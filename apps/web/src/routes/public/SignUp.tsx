import Link from "@mui/material/Link";
import Typography from "@mui/material/Typography";
import { Field } from "@bora/ui";
import { Link as RouterLink, redirect } from "react-router";

import { AuthForm } from "@/components/auth/AuthForm";
import { AuthView } from "@/components/auth/AuthView";
import { signUp } from "@/lib/auth/actions";
import { getSessionContext } from "@/lib/auth/session";
import { ROUTES, homeForRole } from "@/lib/routes";

export async function signUpLoader() {
  const session = await getSessionContext();
  if (session) throw redirect(homeForRole(session.role));
  return null;
}

export function SignUp() {
  return (
    <AuthView
      title="Crie sua conta"
      description="Cadastre seus dados para começar como aluno."
      backTo={ROUTES.signIn}
      footer={
        <>
          Já possui conta?{" "}
          <Link component={RouterLink} to={ROUTES.signIn} fontWeight={700}>
            Entrar
          </Link>
        </>
      }
    >
      <AuthForm action={signUp} submitLabel="Criar minha conta" pendingLabel="Criando…">
        {(state) => (
          <>
            <Field
              label="Nome completo"
              name="name"
              autoComplete="name"
              placeholder="Seu nome completo"
              required
              maxLength={120}
              invalid={state.field === "name" && Boolean(state.error)}
            />
            <Field
              label="E-mail"
              name="email"
              type="email"
              autoComplete="email"
              placeholder="seu@email.com"
              required
              invalid={state.field === "email" && Boolean(state.error)}
            />
            <Field
              label="Senha"
              name="password"
              type="password"
              autoComplete="new-password"
              placeholder="Mínimo de 6 caracteres"
              required
              invalid={state.field === "password" && Boolean(state.error)}
            />

            <Typography variant="caption" component="p" sx={{ textAlign: "center", mb: 2 }}>
              Sua conta será criada como aluno e enviada ao professor responsável para montagem do
              planejamento.
            </Typography>
          </>
        )}
      </AuthForm>
    </AuthView>
  );
}
