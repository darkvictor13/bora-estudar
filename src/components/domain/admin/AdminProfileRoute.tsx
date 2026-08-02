"use client";

import { useCallback } from "react";
import type { FormEvent } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import { PhoneField } from "@/components/form/PhoneField";
import { BRAZILIAN_TIME_ZONES } from "@/lib/domain/timeZones";
import {
  Profile,
  PROFILE_COLUMNS,
  expectRecord,
  callRpc,
  useRemoteData,
  useRpcAction,
  asText,
  optionalText,
  Feedback,
  EmptyPanel,
  RemoteContent,
  Section,
  Field,
  SubmitButton,
} from "./shared";
import styles from "../AdminDomainPage.module.css";

function AdminProfilePage() {
  const loader = useCallback(async (): Promise<{ email: string; profile: Profile | null }> => {
    const supabase = getSupabaseBrowserClient();
    const authResult = await supabase.auth.getUser();
    if (authResult.error) throw authResult.error;
    if (!authResult.data.user) return { email: "", profile: null };
    const profileResult = await supabase.from("profiles").select(PROFILE_COLUMNS).eq("id", authResult.data.user.id).maybeSingle();
    return { email: authResult.data.user.email ?? "", profile: expectRecord<Profile>(profileResult.data, profileResult.error) };
  }, []);
  const remote = useRemoteData(loader);
  const action = useRpcAction(remote.reload);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const name = asText(form, "nome");
    if (name.length < 2) {
      action.setFeedback({ kind: "error", text: "O nome deve possuir ao menos dois caracteres." });
      return;
    }
    await action.run(() => callRpc("atualizar_meu_perfil", {
      p_nome: name,
      p_telefone: optionalText(form, "telefone"),
      p_fuso_horario: asText(form, "fuso_horario") || "America/Sao_Paulo",
    }), "Seu perfil foi atualizado e recarregado do Supabase.");
  }

  return <RemoteContent remote={remote} skeleton="form">{(data) => data.profile ? <Section title="Dados da conta" description="Nome, telefone e fuso são mantidos no perfil; o e-mail vem do Supabase Auth.">
    <form className={styles.formGrid} onSubmit={save} key={data.profile.updated_at}>
      <Field label="Nome"><input className="be-input" name="nome" minLength={2} defaultValue={data.profile.nome} required autoComplete="name" /></Field>
      <Field label="E-mail"><input className="be-input" value={data.email} readOnly disabled /></Field>
      <Field label="Telefone"><PhoneField name="telefone" defaultValue={data.profile.telefone} /></Field>
      <Field label="Fuso horário"><select className="be-input" name="fuso_horario" defaultValue={data.profile.fuso_horario} required>{BRAZILIAN_TIME_ZONES.map((timeZone) => <option value={timeZone} key={timeZone}>{timeZone}</option>)}</select></Field>
      <div className={styles.formActions}><SubmitButton busy={action.busy}>Salvar perfil</SubmitButton></div>
      <Feedback state={action.feedback} />
    </form>
  </Section> : <EmptyPanel title="Perfil não encontrado">A sessão existe, mas o perfil não está disponível pelas políticas atuais.</EmptyPanel>}</RemoteContent>;
}

export function AdminProfileRoute() { return <AdminProfilePage />; }
