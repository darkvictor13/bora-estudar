import Box from "@mui/material/Box";
import Link from "@mui/material/Link";
import Typography from "@mui/material/Typography";
import { Field } from "@bora/ui";
import { Link as RouterLink, redirect } from "react-router";

import { AuthForm } from "@/components/auth/AuthForm";
import { AuthView } from "@/components/auth/AuthView";
import { MAX_NAME_LENGTH } from "@/lib/api";
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
              maxLength={MAX_NAME_LENGTH}
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
            {/*
              A frase "Já existe uma conta" FICA, de propósito (R-AUTH-18, D-14): com
              a confirmação desligada a API a revela a qualquer chamador. Em troca a
              pessoa sai dali com um clique. Decide pelo CÓDIGO, nunca pela frase;
              `conflict` sem `field` é o "Muitas tentativas".
            */}
            {state.code === "conflict" && state.field === "email" && (
              <Box
                data-testid="existing-account"
                sx={{ display: "flex", gap: 2, flexWrap: "wrap", mt: -1, mb: 2 }}
              >
                <Link component={RouterLink} to={ROUTES.signIn} fontWeight={700}>
                  Entrar
                </Link>
                <Link component={RouterLink} to={ROUTES.forgotPassword} fontWeight={700}>
                  Esqueci minha senha
                </Link>
              </Box>
            )}
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
