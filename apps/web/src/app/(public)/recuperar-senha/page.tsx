import Link from "next/link";
import { headers } from "next/headers";
import type { Metadata } from "next";

import { AuthForm } from "@/components/auth/AuthForm";
import { Field } from "@/components/ui";
import { requestPasswordReset } from "@/lib/auth/actions";
import { ROUTES } from "@/lib/routes";

export const metadata: Metadata = { title: "Recuperar senha · Bora Estudar" };

export default async function ForgotPasswordPage() {
  // A origem vem do cabeçalho para o link do e-mail apontar para o mesmo host
  // em que a pessoa está — local, preview ou produção.
  const headerList = await headers();
  const host = headerList.get("host") ?? "localhost:3000";
  const protocol = host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https";

  return (
    <div className="auth__card">
      <p className="auth__brand">Recuperar senha</p>
      <p className="auth__sub">Enviamos um link para você definir uma nova senha.</p>

      <AuthForm action={requestPasswordReset} submitLabel="Enviar link">
        <input type="hidden" name="origin" value={`${protocol}://${host}`} />
        <Field label="E-mail" name="email" type="email" autoComplete="email" required />
      </AuthForm>

      <div className="auth__foot">
        <Link href={ROUTES.signIn}>Voltar para o login</Link>
      </div>
    </div>
  );
}
