import { useLoaderData } from "react-router";

import { AuthForm } from "@/components/auth/AuthForm";
import { Alert, Field } from "@/components/ui";
import { updatePassword } from "@/lib/auth/actions";
import { getSessionContext } from "@/lib/auth/session";

export async function resetPasswordLoader() {
  // O link do e-mail autentica a pessoa antes de chegar aqui, passando por
  // /confirmar. Sem sessão, o link expirou ou já foi usado.
  return { hasSession: (await getSessionContext()) !== null };
}

type LoaderData = Awaited<ReturnType<typeof resetPasswordLoader>>;

export function ResetPassword() {
  const { hasSession } = useLoaderData() as LoaderData;

  return (
    <div className="auth__card">
      <header className="auth__head">
        <p className="auth__brand">Nova senha</p>
        <p className="auth__sub">Escolha uma senha para voltar a acessar sua conta.</p>
      </header>

      {!hasSession ? (
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
