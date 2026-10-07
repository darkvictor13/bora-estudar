import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { Alert, Field } from "@bora/ui";
import { useState } from "react";

import type { ApiError, Goal, RecordStudyInput } from "@/lib/api";
import { MAX_ENTRY_MINUTES, MAX_ENTRY_QUESTIONS, newRequestId } from "@/lib/api";
import { formatMinutes, parseCount } from "@/lib/domain/week";

/**
 * O `registro-modal` da v2: tempo, questões, acertos e observação.
 *
 * REGISTRAR NÃO CONCLUI, e o texto do botão diz isso. A separação é do produto:
 * uma meta recebe vários registros ao longo da semana, e fechar no primeiro
 * obrigaria a reabrir para lançar o segundo.
 *
 * O `requestId` NASCE AO ABRIR O MODAL, não ao enviar. É a terceira das três
 * ordenações do CLAUDE.md: gerá-lo no ponto de uso faria cada tentativa chegar
 * como operação nova, e um duplo clique gravaria duas vezes o mesmo estudo.
 * Aqui a tentativa inteira — inclusive a retentativa depois de um erro de rede
 * — carrega a mesma chave.
 *
 * Este componente NUNCA DESMONTA: devolve `null` quando não há meta. O estado
 * dele, o `requestId` inclusive, atravessaria aberturas — cancelar depois de uma
 * falha e abrir OUTRA meta reaproveitaria a chave, e o servidor leria "mesma
 * chave, outro payload". Quem o monta (`Overview`) passa `key` com o id da meta:
 * cada abertura é uma instância, e a retentativa dentro dela segue com a mesma
 * chave.
 */
export function RecordStudyDialog({
  goal,
  onClose,
  onSubmit,
}: {
  goal: Goal | null;
  onClose: () => void;
  onSubmit: (input: RecordStudyInput) => Promise<ApiError | null>;
}) {
  const [requestId, setRequestId] = useState(newRequestId);
  const [error, setError] = useState<ApiError | null>(null);
  const [pending, setPending] = useState(false);

  if (!goal) return null;

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!goal) return;

    const data = new FormData(event.currentTarget);
    // `parseCount`, e não `Number(x) || 0`: -30, 1.5 e 1e3 passavam por ali, e a
    // validação do contrato os recusa com a frase do campo.
    const number = (name: string) => parseCount(String(data.get(name) ?? ""));

    setPending(true);
    const failure = await onSubmit({
      goalId: goal.id,
      requestId,
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
    // Chave nova só depois do SUCESSO: enquanto a tentativa não vingou, repetir
    // com a mesma chave é o que impede a gravação dupla.
    setRequestId(newRequestId());
    setError(null);
    onClose();
  }

  return (
    <Dialog open fullWidth maxWidth="xs" onClose={onClose} data-testid="record-study-dialog">
      <DialogTitle>Registrar estudo</DialogTitle>
      {/*
        `noValidate`: quem valida é o contrato, não o navegador. Com a validação
        nativa ligada, um campo obrigatório vazio impede o envio e a pessoa lê a
        bolha do Chrome — em inglês em alguns sistemas, e com um texto que não
        é o nosso. As regras e as frases moram em `lib/api/validation.ts`, uma
        vez, para as duas implementações.
      */}
      <Box component="form" noValidate onSubmit={handleSubmit}>
        <DialogContent>
          <Typography variant="body2" sx={{ mb: 2 }}>
            {goal.title} · {goal.subject} · {formatMinutes(goal.plannedMinutes)} planejados
          </Typography>

          {error && <Alert status="error">{error.message}</Alert>}

          <Field
            label="Tempo estudado (minutos)"
            name="minutes"
            type="number"
            inputMode="numeric"
            min={0}
            max={MAX_ENTRY_MINUTES}
            step={1}
            defaultValue={Math.min(goal.plannedMinutes, MAX_ENTRY_MINUTES)}
            autoFocus
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
            placeholder="O que ficou pendente, o que revisar…"
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
            {pending ? "Registrando…" : "Registrar"}
          </Button>
        </DialogActions>
      </Box>
    </Dialog>
  );
}
