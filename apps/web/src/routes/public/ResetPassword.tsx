import { Alert, Field } from "@bora/ui";
import { useLoaderData } from "react-router";

import { AuthForm } from "@/components/auth/AuthForm";
import { AuthView } from "@/components/auth/AuthView";
import { updatePassword } from "@/lib/auth/actions";
import { getSessionContext } from "@/lib/auth/session";
import { ROUTES } from "@/lib/routes";

export async function resetPasswordLoader() {
  // O link do e-mail autentica a pessoa antes de chegar aqui, passando por
  // /confirmar. Sem sessão, o link expirou ou já foi usado.
  return { hasSession: (await getSessionContext()) !== null };
}

type LoaderData = Awaited<ReturnType<typeof resetPasswordLoader>>;

export function ResetPassword() {
  const { hasSession } = useLoaderData() as LoaderData;

  return (
    <AuthView
      title="Redefinir senha"
      description="Crie uma nova senha para acessar sua conta."
      backTo={ROUTES.signIn}
      backLabel="Voltar para o login"
    >
      {!hasSession ? (
        <Alert status="warning">
          Este link expirou ou já foi usado. Peça um novo em “Esqueci minha senha”.
        </Alert>
      ) : (
        <AuthForm action={updatePassword} submitLabel="Salvar nova senha" pendingLabel="Salvando…">
          {(state) => (
            <>
              <Field
                label="Nova senha"
                name="password"
                type="password"
                autoComplete="new-password"
                placeholder="Digite a nova senha"
                required
                invalid={state.field === "password" && Boolean(state.error)}
              />
              <Field
                label="Confirmar nova senha"
                name="passwordConfirmation"
                type="password"
                autoComplete="new-password"
                placeholder="Repita a nova senha"
                required
                invalid={state.field === "passwordConfirmation" && Boolean(state.error)}
              />
            </>
          )}
        </AuthForm>
      )}
    </AuthView>
  );
}
