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

import {
  ApiThrownError,
  type Account,
  type AccountInput,
  type Credentials,
  type Result,
  type Session,
  type SignUpInput,
  type ThemePreference,
} from "../contract.ts";
import { checkCredentials, checkName, checkPassword, checkSignUp } from "../validation.ts";
import { done, fail, failure, settle, throwDb, translateAuthError, translateDbError } from "./errors.ts";
import { currentSession } from "./session.ts";

/**
 * `currentSession` para quem ESCREVE.
 *
 * Ela lança quando não consegue verificar a sessão — rede caída não é estar
 * deslogado —, e escrita devolve `Result`, nunca lança.
 */
async function sessionForWrite(): Promise<Result<Session | null>> {
  try {
    return done(await currentSession());
  } catch (error) {
    if (error instanceof ApiThrownError) return fail(error.code, error.message);
    throw error;
  }
}

export const authApi = {
  loadSession: currentSession,

  async signIn({ email, password }: Credentials): Promise<Result<Session>> {
    const invalid = checkCredentials({ email, password });
    if (invalid) return failure(invalid);

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return failure(translateAuthError(error));

    const found = await sessionForWrite();
    if (!found.ok) return failure(found.error);
    const session = found.data;
    if (!session) return fail("unknown", "Entramos, mas seu perfil não foi encontrado.");
    return done(session);
  },

  async signUp({ email, password, name }: SignUpInput): Promise<Result<Session>> {
    const invalid = checkSignUp({ email, password, name });
    if (invalid) return failure(invalid);

    // Só o nome vai no metadado. O gatilho que cria o perfil IGNORA `role` de
    // propósito (migration 20260914190000): `raw_user_meta_data` é escrito pelo
    // cliente, e quem mandasse `{"role":"teacher"}` nasceria professor. Cadastro
    // público só cria ALUNO; professor é criado por dentro.
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { name: name.trim() } },
    });
    if (error) return failure(translateAuthError(error));

    const found = await sessionForWrite();
    if (!found.ok) return failure(found.error);
    const session = found.data;
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

    // O nome do professor vem de `my_teacher()`, e não de um `select` em
    // `profiles`: a policy `profiles_select` só abre a própria linha e as dos
    // próprios alunos, então a consulta direta voltava vazia e a tela dizia
    // "Ainda sem professor" a quem tinha (QA-08). A RPC devolve TABELA, e o
    // cliente entrega um array. O erro NÃO se descarta: falha de leitura não é
    // ausência de professor.
    //
    // `profiles.plan` é texto livre no schema de 14/09/2026 — o nome do plano
    // comercial, não o planejamento de estudo. Vai cru para a tela.
    const [teacher, planRead] = await Promise.all([
      session.teacherId ? supabase.rpc("my_teacher") : null,
      supabase.from("profiles").select("plan").eq("id", session.profileId).maybeSingle(),
    ]);
    if (teacher?.error) throwDb(teacher.error);
    if (planRead.error) throwDb(planRead.error);
    const teacherName = teacher?.data?.[0]?.name ?? null;
    const profile = planRead.data;

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

  saveAccount({ name }: AccountInput): Promise<Result<Account>> {
    return settle(async () => {
      const invalid = checkName(name);
      if (invalid) return failure(invalid);
      const found = await sessionForWrite();
      if (!found.ok) return failure(found.error);
      const session = found.data;
      if (!session) return fail("unauthenticated", "Sua sessão expirou. Entre de novo.");

      const { error } = await supabase
        .from("profiles")
        .update({ name: name.trim() })
        .eq("id", session.profileId);
      if (error) return failure(translateDbError(error));

      return done(await authApi.loadAccount());
    });
  },

  deleteAccount(): Promise<Result<void>> {
    return settle(async () => {
      const found = await sessionForWrite();
      if (!found.ok) return failure(found.error);
      if (!found.data) return fail("unauthenticated", "Sua sessão expirou. Entre de novo.");

      const { error } = await supabase.rpc("delete_my_account");
      if (error) return failure(translateDbError(error));

      // `local`: a sessão já foi destruída no servidor pela própria RPC, e uma
      // chamada ao `/logout` com ela só devolveria 401. Falta limpar os cookies
      // deste aparelho.
      await supabase.auth.signOut({ scope: "local" });
      return done(undefined);
    });
  },

  /**
   * O tema mora em `profiles.theme_preference` (spec 11, R-TEMA-19), e a CONTA é a
   * fonte da verdade: o loader do layout adota o que vem daqui e atualiza a
   * cópia do aparelho (`adoptTheme`).
   *
   * `null` é "nunca escolheu", e equivale a claro sem ter sido escolhido.
   *
   * SE A LEITURA FALHAR, VALE A CÓPIA DO APARELHO (R-TEMA-21). O aparelho é
   * cache da conta, e o tema não pode derrubar uma tela: rede caída no meio de
   * uma navegação cairia no `ErrorBoundary` da rota por causa de uma cor. Por
   * isso esta leitura não lança, ao contrário das outras do adaptador.
   */
  async loadThemePreference(): Promise<ThemePreference | null> {
    const session = await currentSession();
    if (!session) return null;

    const { data, error } = await supabase
      .from("profiles")
      .select("theme_preference")
      .eq("id", session.profileId)
      .maybeSingle();
    if (error) return readLocalTheme(session.profileId);
    return data?.theme_preference ?? null;
  },

  /**
   * Grava na conta e, antes, no aparelho: a escolha vale aqui mesmo que a
   * gravação remota falhe, e o controle avisa que ela não subiu (R-TEMA-12).
   *
   * `.select("id")` depois do UPDATE é o que distingue "gravou" de "a RLS filtrou
   * em silêncio": UPDATE sem linha visível afeta zero linhas e não dá erro, e a
   * conta excluída cai exatamente aí (`profiles_update_own` exige `deleted_at is
   * null`).
   */
  async saveThemePreference(theme: ThemePreference): Promise<Result<void>> {
    const found = await sessionForWrite();
    if (!found.ok) return failure(found.error);
    const session = found.data;
    if (!session) return fail("unauthenticated", "Sua sessão expirou. Entre de novo.");

    writeLocalTheme(session.profileId, theme);

    const { data, error } = await supabase
      .from("profiles")
      .update({ theme_preference: theme })
      .eq("id", session.profileId)
      .select("id");
    if (error) return failure(translateDbError(error));
    if (!data?.length) return fail("forbidden", "Não foi possível salvar o tema na sua conta.");
    return done(undefined);
  },
};
