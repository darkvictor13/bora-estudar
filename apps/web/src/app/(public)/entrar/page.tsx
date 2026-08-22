import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";

import { AuthForm } from "@/components/auth/AuthForm";
import { Field } from "@/components/ui";
import { signIn } from "@/lib/auth/actions";
import { getSessionContext } from "@/lib/auth/session";
import { ROUTES, homeForRole } from "@/lib/routes";

export const metadata: Metadata = { title: "Entrar · Bora Estudar" };

export default async function SignInPage() {
  const session = await getSessionContext();
  if (session) redirect(homeForRole(session.role));

  return (
    <div className="auth__card">
      <p className="auth__brand">Bora Estudar</p>
      <p className="auth__sub">Entre para continuar seus estudos.</p>

      <AuthForm action={signIn} submitLabel="Entrar" pendingLabel="Entrando…">
        <Field label="E-mail" name="email" type="email" autoComplete="email" required />
        <Field label="Senha" name="password" type="password" autoComplete="current-password" required />
      </AuthForm>

      <div className="auth__foot">
        <Link href={ROUTES.forgotPassword}>Esqueci minha senha</Link>
        <span>
          Não tem conta? <Link href={ROUTES.signUp}>Criar conta</Link>
        </span>
      </div>
    </div>
  );
}
