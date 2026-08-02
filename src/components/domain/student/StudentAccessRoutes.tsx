"use client";

import Link from "next/link";
import { statusLabel } from "@/lib/domain/format";
import type { ResolvedRoute } from "@/lib/routes/types";
import {
  Panel,
  StatusBadge,
  Feedback,
  Empty,
  SubmitButton,
  useStudentDomain,
} from "./shared";
import styles from "../StudentDomainPage.module.css";

export function StudentFeatureRoutes({ route }: { route: ResolvedRoute }) {
  const { busy, runRpc, studentDate, workspace } = useStudentDomain();

function accessContent() {
    const access = workspace.access;
    if (!access) return <Empty title="Acesso ainda não registrado">Seu cadastro existe, mas não foi encontrada uma situação de acesso.</Empty>;
    const effectiveStatus = access.status_efetivo ?? access.status;
    const copy: Record<string, string> = {
      pendente: "Seu acesso ainda aguarda liberação. Você pode entrar na lista de espera para solicitar contato.",
      ativo: "Seu acesso acadêmico está liberado dentro do período informado.",
      bloqueado: `Seu acesso está bloqueado${access.motivo_bloqueio ? `: ${access.motivo_bloqueio}` : "."}`,
      expirado: "O período de acesso terminou. Solicite uma renovação ao seu professor ou atendimento.",
      cancelado: "O acesso foi cancelado. Entre na lista de espera se desejar novo atendimento.",
    };
    return <div className={styles.stack}>
      <Panel><div className={styles.detailHeader}><div><span className="be-section-label">Situação acadêmica</span><h2>{statusLabel(effectiveStatus)}</h2></div><StatusBadge status={effectiveStatus} /></div><p>{copy[effectiveStatus] ?? "Consulte o atendimento para obter detalhes."}</p><dl className={styles.details}><div><dt>Plano</dt><dd>{access.plano}</dd></div><div><dt>Início</dt><dd>{studentDate(access.inicio_em)}</dd></div><div><dt>Validade</dt><dd>{access.expira_em ? studentDate(access.expira_em) : "Sem expiração"}</dd></div>{access.bloqueado_em ? <div><dt>Bloqueado em</dt><dd>{studentDate(access.bloqueado_em, true)}</dd></div> : null}</dl></Panel>
      {effectiveStatus !== "ativo" ? <Link className="be-button be-button--primary" href="/aluno/lista-de-espera">Solicitar contato</Link> : null}
    </div>;
  }


  function waitlistContent() {
    const entry = workspace.waitlist;
    return <div className={styles.stack}>
      {entry ? <Panel><div className={styles.detailHeader}><div><span className="be-section-label">Solicitação enviada em {studentDate(entry.created_at)}</span><h2>{entry.concurso_foco}</h2></div><StatusBadge status={entry.status} /></div><p>{entry.status === "aguardando" ? "Recebemos seu interesse e entraremos em contato." : entry.status === "contatado" ? "Nosso time já iniciou seu atendimento." : entry.status === "convertido" ? "Seu atendimento foi concluído. Consulte agora a situação do acesso." : "Sua participação foi encerrada. Salvar os dados abaixo reativa a solicitação como aguardando."}</p></Panel> : <Feedback message="Informe seus interesses para solicitar contato. Nome e e-mail são lidos do seu perfil e não serão duplicados." />}
      <Panel title={entry?.status === "cancelado" ? "Reativar solicitação" : entry ? "Atualizar meus dados" : "Entrar na lista de espera"}>
        <form className={styles.formGrid} onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          void runRpc("atualizar_minha_lista_espera", { p_whatsapp: String(data.get("whatsapp") ?? ""), p_area_interesse: String(data.get("area") ?? ""), p_concurso_foco: String(data.get("concurso") ?? "") }, entry?.status === "cancelado" ? "Solicitação reativada como aguardando." : entry ? "Dados da lista atualizados." : "Você entrou na lista de espera.");
        }}>
          <label><span className="be-label">Nome</span><input className="be-input" value={workspace.profile?.nome ?? ""} disabled /></label>
          <label><span className="be-label">E-mail</span><input className="be-input" value={workspace.email} disabled /></label>
          <label><span className="be-label">WhatsApp</span><input className="be-input" name="whatsapp" type="tel" defaultValue={entry?.whatsapp ?? ""} required /></label>
          <label><span className="be-label">Área de interesse</span><input className="be-input" name="area" defaultValue={entry?.area_interesse ?? ""} required /></label>
          <label className={styles.spanTwo}><span className="be-label">Concurso em foco</span><input className="be-input" name="concurso" defaultValue={entry?.concurso_foco ?? ""} required /></label>
          <div className={styles.formActions}><SubmitButton busy={busy}>{entry?.status === "cancelado" ? "Reativar na lista" : entry ? "Salvar alterações" : "Entrar na lista"}</SubmitButton>{entry ? <button className="be-button be-button--danger" type="button" disabled={busy} onClick={() => { if (window.confirm("Deseja sair da lista de espera? Seu histórico será preservado.")) void runRpc("soft_delete_lista_espera", { p_id: entry.id, p_reason: "cancelamento solicitado pelo aluno" }, "Participação encerrada."); }}>Sair da lista</button> : null}</div>
        </form>
      </Panel>
    </div>;
  }

  switch (route.pattern) {
    case "acesso":
      return accessContent();
    case "lista-de-espera":
      return waitlistContent();
    default:
      return <Empty title="Tela ainda indisponível">Esta área não pertence a este módulo funcional.</Empty>;
  }
}
