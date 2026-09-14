import { Field } from "@bora/ui";

import { AuthForm } from "@/components/auth/AuthForm";
import { AuthView } from "@/components/auth/AuthView";
import { requestPasswordReset } from "@/lib/auth/actions";
import { ROUTES } from "@/lib/routes";

export function ForgotPassword() {
  return (
    <AuthView
      title="Recuperar senha"
      description="Enviamos um link para você definir uma nova senha."
      backTo={ROUTES.signIn}
      backLabel="Voltar para o login"
    >
      {/*
        Não há campo escondido com a origem. Ela vinha do cabeçalho Host porque
        a action rodava no servidor; agora o adaptador lê `location.origin`, que
        é a origem real de quem está usando o site — local, preview ou produção,
        sem depender de proxy nenhum contar a verdade.
      */}
      <AuthForm action={requestPasswordReset} submitLabel="Enviar link">
        <Field
          label="E-mail"
          name="email"
          type="email"
          autoComplete="email"
          placeholder="seu@email.com"
          required
        />
      </AuthForm>
    </AuthView>
  );
}
