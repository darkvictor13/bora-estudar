"use client";

import type { FormEvent } from "react";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { roleForPath } from "@/lib/auth/policies";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

import styles from "./AuthScreen.module.css";

export type AuthView = "welcome" | "login" | "signup" | "recover" | "reset";

type AuthScreenProps = {
  initialView?: AuthView;
  nextPath?: string;
};

function PasswordField({
  autoComplete,
  id,
  name,
  placeholder,
}: {
  autoComplete: string;
  id: string;
  name: string;
  placeholder: string;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <span className={styles.inputWrap}>
      <input
        className={styles.input}
        id={id}
        name={name}
        type={visible ? "text" : "password"}
        autoComplete={autoComplete}
        placeholder={placeholder}
        minLength={6}
        required
      />
      <button
        className={styles.passwordToggle}
        type="button"
        onClick={() => setVisible((current) => !current)}
        aria-label={visible ? "Ocultar senha" : "Mostrar senha"}
      >
        {visible ? "●" : "◉"}
      </button>
    </span>
  );
}

export function AuthScreen({ initialView = "welcome", nextPath }: AuthScreenProps) {
  const router = useRouter();
  const [view, setView] = useState<AuthView>(initialView);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [busy, setBusy] = useState(false);
  const syncingToken = useRef<string | null>(null);

  function changeView(nextView: AuthView) {
    setError("");
    setSuccess("");
    setView(nextView);
  }

  async function establishNavigationSession(accessToken: string) {
    if (syncingToken.current === accessToken) return;
    syncingToken.current = accessToken;
    const response = await fetch("/api/auth/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accessToken }),
    });
    const result = (await response.json().catch(() => null)) as
      | { error?: string; home?: string; role?: "aluno" | "professor" | "admin" }
      | null;

    if (!response.ok || !result?.home) {
      syncingToken.current = null;
      if (response.status === 403) {
        await getSupabaseBrowserClient().auth.signOut({ scope: "local" });
        await fetch("/api/auth/session", { method: "DELETE" }).catch(() => null);
      }
      throw new Error(result?.error ?? "Não foi possível concluir o acesso.");
    }

    const nextRole = nextPath ? roleForPath(nextPath.split("?")[0]) : null;
    const destination =
      nextPath?.startsWith("/") &&
      !nextPath.startsWith("//") &&
      (!nextRole || nextRole === result.role)
        ? nextPath
        : result.home;
    router.replace(destination);
    router.refresh();
  }

  useEffect(() => {
    if (initialView === "reset") return;
    const supabase = getSupabaseBrowserClient();
    let active = true;

    void supabase.auth.getSession().then(({ data }) => {
      if (active && data.session) {
        setBusy(true);
        void establishNavigationSession(data.session.access_token).catch((reason) => {
          if (active) {
            setError(reason instanceof Error ? reason.message : "Não foi possível concluir o acesso.");
            setBusy(false);
          }
        });
      }
    });

    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active || !session || !["SIGNED_IN", "TOKEN_REFRESHED"].includes(event)) return;
      setBusy(true);
      void establishNavigationSession(session.access_token).catch((reason) => {
        if (active) {
          setError(reason instanceof Error ? reason.message : "Não foi possível concluir o acesso.");
          setBusy(false);
        }
      });
    });

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  // A sessão deve ser inspecionada apenas na montagem/callback do Supabase.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function signInWithGoogle() {
    setBusy(true);
    setError("");
    const supabase = getSupabaseBrowserClient();
    const redirectTo = new URL("/entrar", window.location.origin);
    if (nextPath?.startsWith("/") && !nextPath.startsWith("//")) {
      redirectTo.searchParams.set("proximo", nextPath);
    }
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: redirectTo.toString() },
    });
    if (oauthError) {
      setError("O acesso com Google ainda não está disponível. Verifique a configuração do provedor no Supabase.");
      setBusy(false);
    }
  }

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const data = new FormData(event.currentTarget);
    const { data: authData, error: authError } = await getSupabaseBrowserClient().auth.signInWithPassword({
      email: String(data.get("email") ?? "").trim(),
      password: String(data.get("password") ?? ""),
    });
    if (authError || !authData.session) {
      setError("E-mail ou senha inválidos, ou usuário não confirmado.");
      setBusy(false);
      return;
    }
    try {
      await establishNavigationSession(authData.session.access_token);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível concluir o acesso.");
      setBusy(false);
    }
  }

  async function signUp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setBusy(true);
    setError("");
    setSuccess("");
    const data = new FormData(event.currentTarget);
    const name = String(data.get("name") ?? "").trim();
    const email = String(data.get("email") ?? "").trim().toLowerCase();
    const password = String(data.get("password") ?? "");
    const confirmation = String(data.get("confirmation") ?? "");

    if (password !== confirmation) {
      setError("As senhas informadas não são iguais.");
      setBusy(false);
      return;
    }

    const { data: authData, error: authError } = await getSupabaseBrowserClient().auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: new URL("/entrar", window.location.origin).toString(),
        data: { nome: name, tipo: "aluno" },
      },
    });
    if (authError) {
      setError("Não foi possível criar a conta. Verifique os dados e tente novamente.");
      setBusy(false);
      return;
    }
    if (authData.session) {
      try {
        await establishNavigationSession(authData.session.access_token);
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : "Não foi possível concluir o acesso.");
        setBusy(false);
      }
      return;
    }
    setSuccess("Conta criada! Verifique seu e-mail e confirme o cadastro para entrar.");
    setBusy(false);
    form.reset();
  }

  async function recover(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setSuccess("");
    const email = String(new FormData(event.currentTarget).get("email") ?? "").trim();
    const { error: recoverError } = await getSupabaseBrowserClient().auth.resetPasswordForEmail(email, {
      redirectTo: new URL("/redefinir-senha", window.location.origin).toString(),
    });
    if (recoverError) {
      setError("Não foi possível enviar a recuperação de senha.");
    } else {
      setSuccess("Se o e-mail estiver cadastrado, você receberá as instruções para redefinir a senha.");
    }
    setBusy(false);
  }

  async function resetPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setSuccess("");
    const data = new FormData(event.currentTarget);
    const password = String(data.get("password") ?? "");
    const confirmation = String(data.get("confirmation") ?? "");
    if (password !== confirmation) {
      setError("As senhas não conferem.");
      setBusy(false);
      return;
    }
    const supabase = getSupabaseBrowserClient();
    await supabase.auth.getSession();
    const { error: updateError } = await supabase.auth.updateUser({ password });
    if (updateError) {
      setError("Não foi possível salvar a nova senha. Abra novamente o link recebido por e-mail.");
    } else {
      setSuccess("Senha alterada com sucesso. Você já pode entrar com a nova senha.");
      await supabase.auth.signOut();
    }
    setBusy(false);
  }

  const messages = (
    <>
      {error ? <div className={`${styles.message} ${styles.error}`} role="alert">{error}</div> : null}
      {success ? <div className={`${styles.message} ${styles.success}`} role="status">{success}</div> : null}
    </>
  );

  return (
    <main className={styles.screen}>
      <div className={styles.shell}>
        <section className={styles.story} aria-label="Apresentação da plataforma">
          <h1>Seu concurso começa com um plano.</h1>
          <p>Organize seus estudos, acompanhe sua evolução e avance com metas claras até a aprovação.</p>
          <div className={styles.benefits}>
            <span className={styles.benefit}>Plano de estudos</span>
            <span className={styles.benefit}>Metas semanais</span>
            <span className={styles.benefit}>Evolução real</span>
          </div>
        </section>

        <section className={styles.card} aria-label="Acesso ao Bora Estudar Concursos">
          <div className={styles.brand}>
            <div className={styles.mark} role="img" aria-label="Bora Estudar">
              <span className={styles.monogram}>BE</span>
            </div>
            <div className={styles.product}>Bora Estudar Concursos</div>
          </div>

          <div className={styles.view} key={view}>
            {view === "welcome" ? (
              <>
                <h1 className={styles.heading}>Bem-vindo de volta</h1>
                <p className={styles.sub}>Escolha como deseja acessar a plataforma.</p>
                <button className={`${styles.button} ${styles.google}`} type="button" disabled={busy} onClick={signInWithGoogle}>
                  <span className={styles.googleLetter} aria-hidden="true">G</span>
                  {busy ? "Abrindo Google..." : "Continuar com Google"}
                </button>
                {messages}
                <div className={styles.dividerLabel}><span>ou</span></div>
                <button className={`${styles.button} ${styles.secondary}`} type="button" onClick={() => changeView("login")}>Entrar com e-mail e senha</button>
                <div className={styles.divider} />
                <p className={styles.switch}>Ainda não tem conta? <button className={styles.link} type="button" onClick={() => changeView("signup")}>Crie a sua, é grátis!</button></p>
              </>
            ) : null}

            {view === "login" ? (
              <>
                <button className={styles.back} type="button" onClick={() => changeView("welcome")}>← Voltar</button>
                <h1 className={styles.heading}>Entre na sua conta</h1>
                <p className={styles.sub}>Informe o e-mail e a senha cadastrados.</p>
                <form className={styles.form} onSubmit={signIn}>
                  <label className={styles.label} htmlFor="login-email">E-mail<span className={styles.inputWrap}><input className={styles.input} id="login-email" name="email" type="email" autoComplete="username" placeholder="seu@email.com" required /></span></label>
                  <label className={styles.label} htmlFor="login-password">Senha<PasswordField id="login-password" name="password" autoComplete="current-password" placeholder="Digite sua senha" /></label>
                  {messages}
                  <button className={styles.button} type="submit" disabled={busy}>{busy ? "Entrando..." : "Entrar"}</button>
                  <button className={styles.link} type="button" onClick={() => changeView("recover")}>Esqueci minha senha</button>
                </form>
                <p className={styles.switch}>Não possui conta? <button className={styles.link} type="button" onClick={() => changeView("signup")}>Criar conta</button></p>
              </>
            ) : null}

            {view === "signup" ? (
              <>
                <button className={styles.back} type="button" onClick={() => changeView("welcome")}>← Voltar</button>
                <h1 className={styles.heading}>Crie sua conta</h1>
                <p className={styles.sub}>Cadastre seus dados para começar como aluno.</p>
                <button className={`${styles.button} ${styles.google}`} type="button" disabled={busy} onClick={signInWithGoogle}><span className={styles.googleLetter} aria-hidden="true">G</span>Criar conta com Google</button>
                <div className={styles.dividerLabel}><span>ou crie com e-mail</span></div>
                <form className={styles.form} onSubmit={signUp}>
                  <label className={styles.label} htmlFor="signup-name">Nome completo<span className={styles.inputWrap}><input className={styles.input} id="signup-name" name="name" type="text" autoComplete="name" placeholder="Seu nome completo" maxLength={120} required /></span></label>
                  <label className={styles.label} htmlFor="signup-email">E-mail<span className={styles.inputWrap}><input className={styles.input} id="signup-email" name="email" type="email" autoComplete="email" placeholder="seu@email.com" required /></span></label>
                  <label className={styles.label} htmlFor="signup-password">Senha<PasswordField id="signup-password" name="password" autoComplete="new-password" placeholder="Mínimo de 6 caracteres" /></label>
                  <label className={styles.label} htmlFor="signup-confirmation">Confirmar senha<PasswordField id="signup-confirmation" name="confirmation" autoComplete="new-password" placeholder="Digite a senha novamente" /></label>
                  <p className={styles.accountNote}>Sua conta será criada com o perfil de aluno.</p>
                  {messages}
                  <button className={styles.button} type="submit" disabled={busy}>{busy ? "Criando conta..." : "Criar minha conta"}</button>
                </form>
                <p className={styles.switch}>Já possui conta? <button className={styles.link} type="button" onClick={() => changeView("login")}>Entrar</button></p>
              </>
            ) : null}

            {view === "recover" ? (
              <>
                <button className={styles.back} type="button" onClick={() => changeView("login")}>← Voltar</button>
                <h1 className={styles.heading}>Recuperar senha</h1>
                <p className={styles.sub}>Informe seu e-mail para receber as instruções de recuperação.</p>
                <form className={styles.form} onSubmit={recover}>
                  <label className={styles.label} htmlFor="recover-email">E-mail<span className={styles.inputWrap}><input className={styles.input} id="recover-email" name="email" type="email" autoComplete="email" placeholder="seu@email.com" required /></span></label>
                  {messages}
                  <button className={styles.button} type="submit" disabled={busy}>{busy ? "Enviando..." : "Enviar instruções"}</button>
                </form>
              </>
            ) : null}

            {view === "reset" ? (
              <>
                <h1 className={styles.heading}>Redefinir senha</h1>
                <p className={styles.sub}>Crie uma nova senha para acessar sua conta.</p>
                <form className={styles.form} onSubmit={resetPassword}>
                  <div className={styles.resetHint}>Digite sua nova senha para concluir a recuperação de acesso.</div>
                  <label className={styles.label} htmlFor="reset-password">Nova senha<PasswordField id="reset-password" name="password" autoComplete="new-password" placeholder="Digite a nova senha" /></label>
                  <label className={styles.label} htmlFor="reset-confirmation">Confirmar nova senha<PasswordField id="reset-confirmation" name="confirmation" autoComplete="new-password" placeholder="Repita a nova senha" /></label>
                  {messages}
                  <button className={styles.button} type="submit" disabled={busy}>{busy ? "Salvando..." : "Salvar nova senha"}</button>
                  <button className={styles.back} type="button" onClick={() => router.push("/entrar")}>← Voltar para o login</button>
                </form>
              </>
            ) : null}
          </div>

          <div className={styles.note}>© {new Date().getFullYear()} Bora Estudar Concursos<br />Acesso protegido e dados sincronizados.</div>
        </section>
      </div>
    </main>
  );
}
