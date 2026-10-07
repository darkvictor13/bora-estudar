import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import MenuItem from "@mui/material/MenuItem";
import TextField from "@mui/material/TextField";
import { Alert, Field } from "@bora/ui";
import { useEffect, useState } from "react";

import {
  clearRecordedStudyTimer,
  pauseStudyTimer,
  readStudyTimer,
  resumeStudyTimer,
} from "@/components/StudyTimer";
import type { ApiError, ExtraStudyInput, ExtraStudyKind } from "@/lib/api";
import { MAX_ENTRY_MINUTES, MAX_ENTRY_QUESTIONS, newRequestId } from "@/lib/api";
import { recordedStudyTimerMinutes } from "@/lib/domain/study-timer";
import { parseCount } from "@/lib/domain/week";

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
  minDate,
  maxDate,
  subjects,
  open,
  onClose,
  onSubmit,
}: {
  studyPlanId: string;
  /** A data sugerida (`defaultExtraDate`): o dia escolhido, ou hoje. */
  date: string;
  /** O início do planejamento: nenhum estudo extra é anterior a ele. */
  minDate: string;
  /** Hoje, no fuso do aparelho. */
  maxDate: string;
  /** As matérias da semana, para não obrigar a digitar o que já existe. */
  subjects: readonly string[];
  open: boolean;
  onClose: () => void;
  onSubmit: (input: ExtraStudyInput) => Promise<ApiError | null>;
}) {
  const [requestId, setRequestId] = useState(newRequestId);
  const [error, setError] = useState<ApiError | null>(null);
  const [pending, setPending] = useState(false);
  // O inicializador SÓ LÊ. Escrever aqui — pausar o cronômetro — grava no
  // `localStorage` e dispara o evento da `StudyTimerBar` DURANTE o render, e o
  // React acusa "Cannot update a component while rendering" (QA-27).
  const [linked] = useState(() => {
    const timer = readStudyTimer();
    return { minutes: recordedStudyTimerMinutes(timer, Date.now()), wasRunning: timer.running };
  });
  const [minutes, setMinutes] = useState(() => String(linked.minutes || 30));

  // A escrita vai para um efeito de montagem, que não chama setState. Pausar é
  // idempotente, então o efeito em dobro do modo estrito não faz mal.
  useEffect(() => {
    if (linked.wasRunning) pauseStudyTimer();
  }, [linked.wasRunning]);

  /** Fundo, Esc e o botão: sair sem lançar devolve o cronômetro a quem o tinha correndo (D-16). */
  function cancel() {
    if (linked.wasRunning) resumeStudyTimer();
    onClose();
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    // `parseCount`: -30, 1.5 e 1e3 chegam inválidos à validação do contrato.
    const number = (name: string) => parseCount(String(data.get(name) ?? ""));

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
    // Lançar CONSOME o cronômetro, e por isso não o retoma: `onClose`, e não `cancel`.
    if (linked.minutes > 0) clearRecordedStudyTimer();
    onClose();
  }

  return (
    <Dialog open={open} fullWidth maxWidth="xs" onClose={cancel} data-testid="extra-study-dialog">
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
          {linked.minutes > 0 && <Alert status="info">Cronômetro pausado e vinculado: {linked.minutes} min. Ao lançar, esse tempo será zerado no cronômetro.</Alert>}

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

          <Field
            label="Data"
            name="date"
            type="date"
            defaultValue={date}
            min={minDate}
            max={maxDate}
            invalid={error?.field === "date"}
          />

          <Field
            label="Tempo estudado (minutos)"
            name="minutes"
            type="number"
            inputMode="numeric"
            min={0}
            max={MAX_ENTRY_MINUTES}
            step={1}
            value={minutes}
            onChange={(event) => setMinutes(event.target.value)}
            invalid={error?.field === "minutes"}
          />
          <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1.5 }}>
            <Field
              label="Questões feitas"
              name="questions"
              type="number"
              inputMode="numeric"
              min={0}
              max={MAX_ENTRY_QUESTIONS}
              step={1}
              defaultValue={0}
              invalid={error?.field === "questions"}
            />
            <Field
              label="Acertos"
              name="correctAnswers"
              type="number"
              inputMode="numeric"
              min={0}
              max={MAX_ENTRY_QUESTIONS}
              step={1}
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
          <Button type="button" variant="text" onClick={cancel}>
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
