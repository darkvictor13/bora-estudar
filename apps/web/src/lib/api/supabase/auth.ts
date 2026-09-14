/**
 * SESSÃO, CONTA E TEMA — a fatia que a Fase 2 entregou.
 *
 * Entrar, cadastrar, sair e recuperar senha passam pelo GoTrue; conta e tema
 * passam por `profiles`. É o único módulo do adaptador que fala com
 * `supabase.auth`; os outros só precisam saber QUEM é a pessoa, e isso está em
 * `session.ts`.
 */
import { supabase } from "@/lib/supabase/client";
import { ROUTES } from "@/lib/routes";
import { readLocalTheme, writeLocalTheme } from "@/lib/theme";

import type {
  Account,
  AccountInput,
  Credentials,
  Result,
  Session,
  SignUpInput,
  ThemePreference,
} from "../contract.ts";
import { checkCredentials, checkName, checkPassword, checkSignUp } from "../validation.ts";
import { done, fail, failure, translateAuthError, translateDbError } from "./errors.ts";
import { currentSession } from "./session.ts";

export const authApi = {
  loadSession: currentSession,

  async signIn({ email, password }: Credentials): Promise<Result<Session>> {
    const invalid = checkCredentials({ email, password });
    if (invalid) return failure(invalid);

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return failure(translateAuthError(error));

    const session = await currentSession();
    if (!session) return fail("unknown", "Entramos, mas seu perfil não foi encontrado.");
    return done(session);
  },

  async signUp({ email, password, name }: SignUpInput): Promise<Result<Session>> {
    const invalid = checkSignUp({ email, password, name });
    if (invalid) return failure(invalid);

    // O papel vai no metadata: o gatilho que cria o perfil lê `role` de lá.
    // Cadastro público só cria ALUNO; professor é criado por dentro.
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { name: name.trim(), role: "student" } },
    });
    if (error) return failure(translateAuthError(error));

    const session = await currentSession();
    if (!session) {
      // Confirmação de e-mail ligada: a conta existe, a sessão ainda não.
      return fail("validation", "Confirme seu e-mail para entrar.");
    }
    return done(session);
  },

  async signOut(): Promise<Result<void>> {
    const { error } = await supabase.auth.signOut();
    if (error) return failure(translateAuthError(error));
    return done(undefined);
  },

  async requestPasswordReset(email: string): Promise<Result<void>> {
    if (!email) return fail("validation", "Informe seu e-mail.", "email");

    // A origem sai de `location`, e não de um campo escondido alimentado pelo
    // cabeçalho Host: no navegador ela é a origem de verdade — local, preview
    // ou produção — sem depender de proxy nenhum contar a verdade.
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${location.origin}${ROUTES.authCallback}?next=${encodeURIComponent(ROUTES.resetPassword)}`,
    });
    if (error) return failure(translateAuthError(error));
    return done(undefined);
  },

  async resetPassword(password: string): Promise<Result<void>> {
    const invalid = checkPassword(password);
    if (invalid) return failure(invalid);
    const { error } = await supabase.auth.updateUser({ password });
    if (error) return failure(translateAuthError(error));
    return done(undefined);
  },

  async loadAccount(): Promise<Account> {
    const session = await currentSession();
    if (!session) throw new Error("Sem sessão.");

    let teacherName: string | null = null;
    if (session.teacherId) {
      const { data } = await supabase
        .from("profiles")
        .select("name")
        .eq("id", session.teacherId)
        .maybeSingle();
      teacherName = data?.name ?? null;
    }

    // `profiles.plan` é texto livre no schema de 14/09/2026 — o nome do plano
    // comercial, não o planejamento de estudo. Vai cru para a tela.
    const { data: profile } = await supabase
      .from("profiles")
      .select("plan")
      .eq("id", session.profileId)
      .maybeSingle();

    return {
      profileId: session.profileId,
      name: session.name,
      email: session.email,
      plan: profile?.plan ?? null,
      access: session.access,
      accessExpiresAt: session.accessExpiresAt,
      teacherName,
    };
  },

  async saveAccount({ name }: AccountInput): Promise<Result<Account>> {
    const invalid = checkName(name);
    if (invalid) return failure(invalid);
    const session = await currentSession();
    if (!session) return fail("unauthenticated", "Sua sessão expirou. Entre de novo.");

    const { error } = await supabase
      .from("profiles")
      .update({ name: name.trim() })
      .eq("id", session.profileId);
    if (error) return failure(translateDbError(error));

    return done(await authApi.loadAccount());
  },

  /**
   * O TEMA AINDA NÃO TEM ONDE MORAR NO BANCO — é a lacuna nº 1 do contrato.
   *
   * O schema de 14/09/2026 removeu `user_preferences` e nada a substituiu:
   * `profiles` não tem coluna de preferência. Enquanto a frente do banco não
   * entregar (uma coluna `theme_preference` em `profiles` basta), a escolha
   * vale por APARELHO, guardada pelo mesmo `lib/theme.ts` que pinta o
   * documento antes do primeiro paint.
   *
   * A consequência a dizer em voz alta: quem escolhe escuro no computador
   * continua vendo claro no celular, e R-TEMA-11 — "o que a conta diz
   * prevalece" — está suspenso até a coluna existir. Nada aqui inventa tabela:
   * um adaptador que grava onde ninguém combinou é pior do que um que avisa.
   */
  async loadThemePreference(): Promise<ThemePreference | null> {
    const session = await currentSession();
    return session ? readLocalTheme(session.profileId) : null;
  },

  async saveThemePreference(theme: ThemePreference): Promise<Result<void>> {
    const session = await currentSession();
    if (!session) return fail("unauthenticated", "Sua sessão expirou. Entre de novo.");
    writeLocalTheme(session.profileId, theme);
    return done(undefined);
  },
};
