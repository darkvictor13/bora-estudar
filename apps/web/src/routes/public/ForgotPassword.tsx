import { Link } from "react-router";

import { AuthForm } from "@/components/auth/AuthForm";
import { Field } from "@/components/ui";
import { requestPasswordReset } from "@/lib/auth/actions";
import { ROUTES } from "@/lib/routes";

export function ForgotPassword() {
  return (
    <div className="auth__card">
      <p className="auth__brand">Recuperar senha</p>
      <p className="auth__sub">Enviamos um link para você definir uma nova senha.</p>

      {/*
        Não há mais campo escondido com a origem. Ela vinha do cabeçalho Host
        porque a action rodava no servidor; agora a action lê `location.origin`,
        que é a origem real de quem está usando o site.
      */}
      <AuthForm action={requestPasswordReset} submitLabel="Enviar link">
        <Field label="E-mail" name="email" type="email" autoComplete="email" required />
      </AuthForm>

      <div className="auth__foot">
        <Link to={ROUTES.signIn}>Voltar para o login</Link>
      </div>
    </div>
  );
}
