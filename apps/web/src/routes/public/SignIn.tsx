import { Link, redirect } from "react-router";

import { AuthForm } from "@/components/auth/AuthForm";
import { Field } from "@/components/ui";
import { signIn } from "@/lib/auth/actions";
import { getSessionContext } from "@/lib/auth/session";
import { ROUTES, homeForRole } from "@/lib/routes";

export async function signInLoader() {
  const session = await getSessionContext();
  if (session) throw redirect(homeForRole(session.role));
  return null;
}

export function SignIn() {
  return (
    <div className="auth__card">
      <p className="auth__brand">Bora Estudar</p>
      <p className="auth__sub">Entre para continuar seus estudos.</p>

      <AuthForm action={signIn} submitLabel="Entrar" pendingLabel="Entrando…">
        <Field label="E-mail" name="email" type="email" autoComplete="email" required />
        <Field label="Senha" name="password" type="password" autoComplete="current-password" required />
      </AuthForm>

      <div className="auth__foot">
        <Link to={ROUTES.forgotPassword}>Esqueci minha senha</Link>
        <span>
          Não tem conta? <Link to={ROUTES.signUp}>Criar conta</Link>
        </span>
      </div>
    </div>
  );
}
