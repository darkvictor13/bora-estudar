"use client";

import { PhoneField } from "@/components/form/PhoneField";
import { BRAZILIAN_TIME_ZONES } from "@/lib/domain/timeZones";
import type { ResolvedRoute } from "@/lib/routes/types";
import {
  Panel,
  Empty,
  SubmitButton,
  useStudentDomain,
} from "./shared";
import styles from "../StudentDomainPage.module.css";

export function StudentFeatureRoutes({ route }: { route: ResolvedRoute }) {
  const { busy, runRpc, workspace } = useStudentDomain();

function profileContent() {
    const profile = workspace.profile;
    if (!profile) return <Empty title="Perfil não encontrado">Não foi possível localizar os dados da sua conta.</Empty>;
    return <Panel title="Dados da conta" subtitle="O fuso horário é usado para agenda, sequência e datas de conclusão.">
      <form className={styles.formGrid} onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        void runRpc("atualizar_meu_perfil", { p_nome: String(data.get("nome") ?? ""), p_telefone: String(data.get("telefone") ?? "") || null, p_fuso_horario: String(data.get("fuso") ?? "America/Sao_Paulo") }, "Perfil atualizado.");
      }}>
        <label><span className="be-label">Nome</span><input className="be-input" name="nome" minLength={2} defaultValue={profile.nome} required /></label>
        <label><span className="be-label">E-mail</span><input className="be-input" value={workspace.email} disabled /></label>
        <label><span className="be-label">Telefone</span><PhoneField name="telefone" defaultValue={profile.telefone} /></label>
        <label><span className="be-label">Fuso horário</span><select className="be-input" name="fuso" defaultValue={profile.fuso_horario}>{BRAZILIAN_TIME_ZONES.map((timeZone) => <option value={timeZone} key={timeZone}>{timeZone}</option>)}</select></label>
        <div className={styles.formActions}><SubmitButton busy={busy}>Salvar perfil</SubmitButton></div>
      </form>
    </Panel>;
  }

  switch (route.pattern) {
    case "perfil":
      return profileContent();
    default:
      return <Empty title="Tela ainda indisponível">Esta área não pertence a este módulo funcional.</Empty>;
  }
}
