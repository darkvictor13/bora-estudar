import { useFormStatus } from "react-dom";

import { Alert } from "@/components/ui";
import { useFormActionState } from "@/lib/forms/useFormActionState";
import { generateWeek } from "@/lib/data/teacher-actions";
import { WEEKDAY_NAMES } from "@/lib/domain/goals";

interface BlockOption {
  readonly id: string;
  readonly name: string;
  readonly subjectName: string;
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

  return (
    <form action={formAction}>
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

      <Submit />
    </form>
  );
}
