import type { Metadata } from "next";

import { AuthForm } from "@/components/auth/AuthForm";
import { Field } from "@/components/ui";
import { Alert } from "@/components/ui";
import { updatePassword } from "@/lib/auth/actions";
import { getSessionContext } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Nova senha · Bora Estudar" };

export default async function ResetPasswordPage() {
  // O link do e-mail autentica a pessoa antes de chegar aqui. Sem sessão, o
  // link expirou ou já foi usado.
  const session = await getSessionContext();

  return (
    <div className="auth__card">
      <p className="auth__brand">Nova senha</p>
      <p className="auth__sub">Escolha uma senha para voltar a acessar sua conta.</p>

      {!session ? (
        <Alert kind="warning">
          Este link expirou ou já foi usado. Peça um novo em “Esqueci minha senha”.
        </Alert>
      ) : (
        <AuthForm action={updatePassword} submitLabel="Salvar senha" pendingLabel="Salvando…">
          <Field
            label="Nova senha"
            name="password"
            type="password"
            autoComplete="new-password"
            required
            minLength={6}
          />
          <Field
            label="Confirme a nova senha"
            name="passwordConfirmation"
            type="password"
            autoComplete="new-password"
            required
            minLength={6}
          />
        </AuthForm>
      )}
    </div>
  );
}
