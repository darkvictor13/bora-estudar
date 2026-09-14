import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import MenuItem from "@mui/material/MenuItem";
import TextField from "@mui/material/TextField";
import { Alert, Field } from "@bora/ui";
import { useState } from "react";

import type { ApiError, ExtraStudyInput, ExtraStudyKind } from "@/lib/api";
import { newRequestId } from "@/lib/api";

/**
 * Os cinco estudos que a v2 aceita fora das metas.
 *
 * A lista é fechada, e não um campo de texto, porque a versão anterior guardava
 * isso como `TIPO_REFORCO:1` dentro do campo de observações — e o round-trip
 * destruía o texto a cada gravação. Tipo é enum ou FK; nunca texto livre.
 */
const KINDS: readonly { value: ExtraStudyKind; label: string }[] = [
  { value: "dry_law", label: "Lei seca" },
  { value: "anki", label: "Anki" },
  { value: "mock_exam", label: "Simulado" },
  { value: "review", label: "Revisão" },
  { value: "extra_questions", label: "Questões extras" },
];

/**
 * O `extra-modal` da v2: estudo que aconteceu FORA do que o professor planejou.
 *
 * Cria a meta e o registro numa operação só, porque na tela é um botão só. O
 * que o aluno lança aqui nasce `extra` — é o único tipo, junto de `reinforcement`,
 * que a RLS deixa o aluno criar, e é ele que governa quem pode apagar depois.
 */
export function ExtraStudyDialog({
  studyPlanId,
  date,
  subjects,
  open,
  onClose,
  onSubmit,
}: {
  studyPlanId: string;
  /** O dia em que o botão foi clicado. A v2 abre o modal já no dia do grupo. */
  date: string;
  /** As matérias da semana, para não obrigar a digitar o que já existe. */
  subjects: readonly string[];
  open: boolean;
  onClose: () => void;
  onSubmit: (input: ExtraStudyInput) => Promise<ApiError | null>;
}) {
  const [requestId, setRequestId] = useState(newRequestId);
  const [error, setError] = useState<ApiError | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const number = (name: string) => Number(data.get(name) ?? 0) || 0;

    setPending(true);
    const failure = await onSubmit({
      studyPlanId,
      requestId,
      kind: String(data.get("kind")) as ExtraStudyKind,
      subject: String(data.get("subject") ?? "").trim(),
      date: String(data.get("date") ?? date),
      minutes: number("minutes"),
      questions: number("questions"),
      correctAnswers: number("correctAnswers"),
      ...(String(data.get("note") ?? "").trim()
        ? { note: String(data.get("note")).trim() }
        : {}),
    });
    setPending(false);

    if (failure) {
      setError(failure);
      return;
    }
    setRequestId(newRequestId());
    setError(null);
    onClose();
  }

  return (
    <Dialog open={open} fullWidth maxWidth="xs" onClose={onClose} data-testid="extra-study-dialog">
      <DialogTitle>Estudo extra</DialogTitle>
      {/*
        `noValidate`: quem valida é o contrato, não o navegador. Com a validação
        nativa ligada, um campo obrigatório vazio impede o envio e a pessoa lê a
        bolha do Chrome — em inglês em alguns sistemas, e com um texto que não
        é o nosso. As regras e as frases moram em `lib/api/validation.ts`, uma
        vez, para as duas implementações.
      */}
      <Box component="form" noValidate onSubmit={handleSubmit}>
        <DialogContent>
          {error && <Alert status="error">{error.message}</Alert>}

          <TextField
            select
            name="kind"
            label="Tipo"
            defaultValue={KINDS[0]!.value}
            fullWidth
            size="small"
            sx={{ mb: 1.75 }}
          >
            {KINDS.map((kind) => (
              <MenuItem key={kind.value} value={kind.value}>
                {kind.label}
              </MenuItem>
            ))}
          </TextField>

          {/*
            Lista com escrita livre: a matéria pode ser uma das da semana — o
            caso comum — ou uma que o planejamento não cobre, que é justamente o
            motivo de existir estudo extra.
          */}
          <Field
            label="Matéria"
            name="subject"
            list="extra-subjects"
            placeholder="Direito Penal"
            required
            invalid={error?.field === "subject"}
          />
          <datalist id="extra-subjects">
            {subjects.map((subject) => (
              <option key={subject} value={subject} />
            ))}
          </datalist>

          <Field label="Data" name="date" type="date" defaultValue={date} />

          <Field
            label="Tempo estudado (minutos)"
            name="minutes"
            type="number"
            inputMode="numeric"
            min={0}
            defaultValue={30}
            invalid={error?.field === "minutes"}
          />
          <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1.5 }}>
            <Field
              label="Questões feitas"
              name="questions"
              type="number"
              inputMode="numeric"
              min={0}
              defaultValue={0}
            />
            <Field
              label="Acertos"
              name="correctAnswers"
              type="number"
              inputMode="numeric"
              min={0}
              defaultValue={0}
              invalid={error?.field === "correctAnswers"}
            />
          </Box>
          <TextField
            name="note"
            label="Observação"
            multiline
            minRows={2}
            fullWidth
            size="small"
          />
        </DialogContent>
        <DialogActions>
          <Button type="button" variant="text" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" variant="contained" disabled={pending}>
            {pending ? "Salvando…" : "Lançar estudo"}
          </Button>
        </DialogActions>
      </Box>
    </Dialog>
  );
}
