import { Link, redirect } from "react-router";

import { AuthForm } from "@/components/auth/AuthForm";
import { Field } from "@/components/ui";
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
    <div className="auth__card">
      <p className="auth__brand">Criar conta</p>
      <p className="auth__sub">
        O acesso é liberado pelo professor. Depois do cadastro você entra na lista de espera.
      </p>

      <AuthForm action={signUp} submitLabel="Criar conta" pendingLabel="Criando…">
        <Field label="Nome completo" name="name" autoComplete="name" required minLength={3} />
        <Field label="E-mail" name="email" type="email" autoComplete="email" required />
        <Field
          label="Senha"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={6}
          hint="Pelo menos 6 caracteres."
        />
      </AuthForm>

      <div className="auth__foot">
        <span>
          Já tem conta? <Link to={ROUTES.signIn}>Entrar</Link>
        </span>
      </div>
    </div>
  );
}
