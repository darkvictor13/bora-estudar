import { useRef, useState } from "react";
import { useFormStatus } from "react-dom";

import { Alert, Empty } from "@/components/ui";
import { useFormActionState } from "@/lib/forms/useFormActionState";
import { generateWeek, readWeights } from "@/lib/data/teacher-actions";
import { WEEKDAY_NAMES, weekdayName } from "@/lib/domain/goals";
import {
  MAX_SUBJECT_WEIGHT,
  MAX_WEEK_GOALS,
  buildWeek,
  groupIntoSubjects,
  type GoalDraft,
} from "@/lib/domain/week-planner";

interface BlockOption {
  readonly id: string;
  readonly name: string;
  readonly subjectName: string;
  /** Metas de bateria que este bloco já tem, para o rodízio continuar. */
  readonly used: number;
}

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn--primary" disabled={pending}>
      {pending ? "Gerando…" : "Gerar metas da semana"}
    </button>
  );
}

export function GenerateWeekForm({
  studyPlanId,
  blocks,
  nextWeek,
}: {
  studyPlanId: string;
  blocks: readonly BlockOption[];
  nextWeek: number;
}) {
  const [state, formAction] = useFormActionState(generateWeek);
  const formRef = useRef<HTMLFormElement>(null);
  const [preview, setPreview] = useState<GoalDraft[] | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const subjectNames = [...new Set(blocks.map((b) => b.subjectName))];

  /**
   * Calcula a prévia no navegador, pela MESMA função pura que a action usa.
   *
   * Sem ida ao servidor: `buildWeek` é determinística, então prévia e gravação
   * não têm como divergir por causa do transporte. O que pode divergir é o
   * ponto de partida do rodízio, que a action relê do banco — a prévia é
   * conferência, o banco é a verdade (R-PREV-14).
   */
  function handlePreview() {
    setPreviewError(null);
    const form = formRef.current;
    if (!form) return;

    const data = new FormData(form);
    const weekdays = data.getAll("weekdays").map(Number).filter((n) => n >= 0 && n <= 6);
    const chosen = new Set(data.getAll("blocks").map(String));
    const minutes = Number(data.get("minutes")) || 60;
    const withTheory = data.get("withTheory") === "on";

    if (!weekdays.length) return setPreviewError("Escolha pelo menos um dia de estudo.");
    if (!chosen.size) return setPreviewError("Escolha pelo menos um bloco.");

    const selected = blocks.filter((b) => chosen.has(b.id));
    const rawTotal = String(data.get("total") ?? "").trim();
    const total = rawTotal ? Number(rawTotal) : selected.length;
    if (!Number.isInteger(total) || total < 1 || total > MAX_WEEK_GOALS) {
      return setPreviewError(`O total de metas precisa ficar entre 1 e ${MAX_WEEK_GOALS}.`);
    }

    const weights = readWeights(data);
    const subjects = groupIntoSubjects(
      selected.map((b) => ({ id: b.id, name: b.name, subject_name: b.subjectName })),
      (subject) => weights.get(subject) ?? 1,
      (blockId) => selected.find((b) => b.id === blockId)?.used ?? 0,
    );

    setPreview(
      buildWeek(subjects, [...weekdays].sort((a, b) => a - b), minutes, withTheory, total),
    );
  }

  const byWeekday = new Map<number, GoalDraft[]>();
  for (const draft of preview ?? []) {
    byWeekday.set(draft.weekday, [...(byWeekday.get(draft.weekday) ?? []), draft]);
  }

  return (
    /*
      `noValidate` pela mesma razão do formulário de login (F-AUTH-03): quem
      valida é a action, e a mensagem sai em português dentro da tela. Com a
      validação nativa ligada, `max={80}` no total faria o navegador barrar o
      envio com uma tooltip própria — a action nunca rodaria, e a regra do
      teto viveria em dois lugares.
    */
    <form action={formAction} ref={formRef} noValidate>
      {state.error && <Alert kind="error">{state.error}</Alert>}
      {state.success && <Alert kind="success">{state.success}</Alert>}

      <input type="hidden" name="studyPlanId" value={studyPlanId} />

      <div className="row" style={{ alignItems: "flex-start", gap: 20 }}>
        <div className="field" style={{ minWidth: 120 }}>
          <label className="field__label" htmlFor="week">
            Semana
          </label>
          <input id="week" name="week" type="number" min={1} max={200} defaultValue={nextWeek} required />
        </div>

        <div className="field" style={{ minWidth: 150 }}>
          <label className="field__label" htmlFor="total">
            Total de baterias
          </label>
          <input
            id="total"
            name="total"
            type="number"
            min={1}
            max={MAX_WEEK_GOALS}
            defaultValue={blocks.length}
          />
          <span className="field__hint">Repartido entre as disciplinas pelo peso.</span>
        </div>

        <div className="field" style={{ minWidth: 170 }}>
          <label className="field__label" htmlFor="minutes">
            Tempo por meta (min)
          </label>
          <input id="minutes" name="minutes" type="number" min={5} max={480} defaultValue={60} />
        </div>

        <div className="field" style={{ minWidth: 230 }}>
          <label className="field__label" htmlFor="mode">
            Se a semana já existir
          </label>
          <select id="mode" name="mode" defaultValue="append">
            <option value="append">Acrescentar às metas atuais</option>
            <option value="replace">Substituir as pendentes</option>
            <option value="replan">Replanejar o que não foi feito</option>
          </select>
        </div>
      </div>

      <fieldset style={{ border: 0, padding: 0, margin: "0 0 14px" }}>
        <legend className="field__label" style={{ marginBottom: 6 }}>
          Peso por disciplina
        </legend>
        <p className="muted" style={{ marginTop: 0 }}>
          Quanto maior o peso, mais baterias da disciplina na semana. Peso <strong>0</strong> tira
          a disciplina desta semana sem desativar os cadernos dela.
        </p>
        <div className="row">
          {subjectNames.map((subject, index) => (
            <div key={subject} className="field" style={{ minWidth: 160, marginBottom: 0 }}>
              {/*
                O `id` é por índice, não pelo nome da disciplina: "Ciências
                Forenses" tem espaço e acento, e `#peso-Ciências Forenses` não é
                seletor CSS válido. O `name` continua carregando o nome, que é o
                que a action lê.
              */}
              <label className="field__label" htmlFor={`peso-${index}`}>
                {subject}
              </label>
              <input
                id={`peso-${index}`}
                name={`peso:${subject}`}
                type="number"
                min={0}
                max={MAX_SUBJECT_WEIGHT}
                defaultValue={1}
              />
            </div>
          ))}
        </div>
      </fieldset>

      <fieldset style={{ border: 0, padding: 0, margin: "0 0 14px" }}>
        <legend className="field__label" style={{ marginBottom: 6 }}>
          Dias de estudo
        </legend>
        <div className="row">
          {WEEKDAY_NAMES.map((name, index) => (
            <label key={name} className="row" style={{ gap: 6 }}>
              <input
                type="checkbox"
                name="weekdays"
                value={index}
                defaultChecked={index >= 1 && index <= 5}
              />
              {name.slice(0, 3)}
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset style={{ border: 0, padding: 0, margin: "0 0 14px" }}>
        <legend className="field__label" style={{ marginBottom: 6 }}>
          Blocos ({blocks.length} disponíveis)
        </legend>
        <div className="stack-sm" style={{ maxHeight: 220, overflowY: "auto" }}>
          {blocks.map((block) => (
            <label key={block.id} className="row" style={{ gap: 8 }}>
              <input type="checkbox" name="blocks" value={block.id} defaultChecked />
              <span>
                <strong>{block.subjectName}</strong> · {block.name}
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <label className="row" style={{ gap: 8, marginBottom: 16 }}>
        <input type="checkbox" name="withTheory" defaultChecked />
        Criar uma meta de teoria antes de cada bateria
      </label>

      <div className="row">
        <Submit />
        {/*
          `type="button"`: o único submit deste formulário continua sendo
          "Gerar metas da semana". É a armadilha do CLAUDE.md, e vale aqui como
          em toda tela.
        */}
        <button type="button" className="btn btn--ghost" onClick={handlePreview}>
          Gerar prévia
        </button>
      </div>

      {previewError && <Alert kind="error">{previewError}</Alert>}

      {preview && (
        <section className="preview" style={{ marginTop: 20 }}>
          <h3>
            Prévia — {preview.length} meta(s)
            <span className="muted" style={{ fontWeight: 400 }}>
              {" "}
              · nada foi gravado ainda
            </span>
          </h3>
          {preview.length === 0 ? (
            <Empty>Com esses pesos nenhuma meta seria criada.</Empty>
          ) : (
            <div className="stack-sm">
              {[...byWeekday.entries()]
                .sort(([a], [b]) => a - b)
                .map(([weekday, drafts]) => (
                  <div key={weekday}>
                    <strong>{weekdayName(weekday)}</strong>
                    <ul className="muted" style={{ margin: "4px 0 0", paddingLeft: 20 }}>
                      {drafts.map((draft) => (
                        <li key={`${draft.weekday}-${draft.position}`}>{draft.title}</li>
                      ))}
                    </ul>
                  </div>
                ))}
            </div>
          )}
        </section>
      )}
    </form>
  );
}
