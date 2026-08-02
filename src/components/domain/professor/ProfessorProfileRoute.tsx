"use client";

import { useCallback } from "react";
import type { FormEvent } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import { PhoneField } from "@/components/form/PhoneField";
import { BRAZILIAN_TIME_ZONES } from "@/lib/domain/timeZones";
import {
  Profile,
  callRpc,
  useResource,
  useMutationFeedback,
  Feedback,
  ResourceGate,
  formText,
  formatDate,
  badgeClass,
  SectionTitle,
} from "./shared";
import styles from "../ProfessorDomainPage.module.css";

function ProfessorProfilePage() {
  const load = useCallback(async () => {
    const supabase = getSupabaseBrowserClient();
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError) throw userError;
    if (!userData.user) return null;
    const { data, error } = await supabase
      .from("profiles")
      .select("id, nome, telefone, fuso_horario, ativo, tipo, updated_at")
      .eq("id", userData.user.id)
      .maybeSingle();
    if (error) throw error;
    return data ? { email: userData.user.email ?? "", profile: data as Profile } : null;
  }, []);
  const resource = useResource(load);
  const mutation = useMutationFeedback();

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const saved = await mutation.run("profile", () => callRpc("atualizar_meu_perfil", {
      p_fuso_horario: formText(data, "timezone"),
      p_nome: formText(data, "name"),
      p_telefone: formText(data, "phone") || null,
    }), "Perfil atualizado com confirmação do Supabase.");
    if (saved) resource.reload();
  }

  return (
    <ResourceGate resource={resource} skeleton="form">
      {(record) => (
        <section className={`be-card ${styles.formCard}`}>
          <SectionTitle title="Dados do professor" description="Nome, telefone e fuso usados pela sua conta." />
          <form className={styles.form} onSubmit={save}>
            <label className={styles.field} htmlFor="professor-profile-name">
              <span>Nome</span>
              <input className="be-input" id="professor-profile-name" name="name" defaultValue={record.profile.nome} minLength={2} required />
            </label>
            <label className={styles.field} htmlFor="professor-profile-email">
              <span>E-mail</span>
              <input className="be-input" id="professor-profile-email" value={record.email} readOnly disabled />
            </label>
            <label className={styles.field} htmlFor="professor-profile-phone">
              <span>Telefone</span>
              <PhoneField id="professor-profile-phone" name="phone" defaultValue={record.profile.telefone} />
            </label>
            <label className={styles.field} htmlFor="professor-profile-timezone">
              <span>Fuso horário</span>
              <select className="be-input" id="professor-profile-timezone" name="timezone" defaultValue={record.profile.fuso_horario} required>
                {BRAZILIAN_TIME_ZONES.map((timeZone) => <option value={timeZone} key={timeZone}>{timeZone}</option>)}
              </select>
            </label>
            <div className={styles.fullWidth}>
              <span className={badgeClass(record.profile.ativo ? "ativo" : "inativo")}>{record.profile.ativo ? "Perfil ativo" : "Perfil inativo"}</span>
              <p className={styles.hint}>Última confirmação do servidor: {formatDate(record.profile.updated_at, true)}</p>
            </div>
            <Feedback error={mutation.error} success={mutation.success} />
            <div className={`${styles.actions} ${styles.fullWidth}`}>
              <button className="be-button be-button--primary" type="submit" disabled={mutation.pending !== null}>
                {mutation.pending ? "Salvando..." : "Salvar perfil"}
              </button>
            </div>
          </form>
        </section>
      )}
    </ResourceGate>
  );
}

export function ProfessorProfileRoute() { return <ProfessorProfilePage />; }
