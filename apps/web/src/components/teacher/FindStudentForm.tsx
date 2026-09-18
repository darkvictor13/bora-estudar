import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Typography from "@mui/material/Typography";
import { Alert, Field } from "@bora/ui";
import { useState } from "react";
import { useRevalidator } from "react-router";

import { api, type ApiError, type StudentSearchResult } from "@/lib/api";

/**
 * ASSUMIR UM ALUNO — o começo de tudo, e não existia.
 *
 * O perfil nasce aluno, pendente e sem professor. Sem esta caixa, o professor
 * que se cadastrasse veria a lista de alunos vazia para sempre e o aluno veria
 * a lista de espera para sempre — nenhum dos dois com caminho para sair dali.
 *
 * ## Por que um campo de e-mail, e não uma lista
 *
 * Havia uma lista: a policy `waitlist_select` mostrava toda inscrição sem
 * professor a QUALQUER professor — nome, e-mail, WhatsApp e data de nascimento
 * de quem ainda não é aluno de ninguém. Numa escola física isso não é
 * necessário, porque a pessoa está na frente de quem digita. A policy fechou em
 * 18/09/2026, e o que ficou é a busca pelo endereço INTEIRO: casar por prefixo
 * seria enumeração com outro nome.
 *
 * ## O que a tela não diz
 *
 * De quem o aluno é, quando ele já tem professor. A RPC não devolve o dado —
 * revelar transformaria a busca num mapa de quem é aluno de quem —, e a tela
 * diz "já tem professor" e para por aí. Dizer "não existe" seria pior: faria a
 * pessoa duvidar do e-mail que ela digitou certo.
 */
export function FindStudentForm() {
  const { revalidate } = useRevalidator();

  const [error, setError] = useState<ApiError | null>(null);
  const [found, setFound] = useState<StudentSearchResult | null | "none">("none");
  const [busy, setBusy] = useState(false);

  async function search(data: FormData) {
    setBusy(true);
    const result = await api.findStudentByEmail(String(data.get("email") ?? ""));
    setBusy(false);

    if (!result.ok) {
      setError(result.error);
      setFound("none");
      return;
    }
    setError(null);
    setFound(result.data);
  }

  async function link(studentId: string) {
    setBusy(true);
    const result = await api.linkStudent(studentId);
    setBusy(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }
    setError(null);
    setFound("none");
    await revalidate();
  }

  return (
    <Box
      component="form"
      noValidate
      data-testid="find-student-form"
      onSubmit={(event) => {
        event.preventDefault();
        void search(new FormData(event.currentTarget));
      }}
    >
      {error && <Alert status="error">{error.message}</Alert>}

      <Box sx={{ display: "flex", gap: 1.5, alignItems: "flex-start", flexWrap: "wrap" }}>
        <Box sx={{ flex: 1, minWidth: 240 }}>
          <Field
            label="E-mail do aluno"
            name="email"
            type="email"
            autoComplete="off"
            hint="O endereço inteiro, como ele o cadastrou."
            invalid={error?.field === "email"}
          />
        </Box>
        <Button
          type="submit"
          variant="outlined"
          disabled={busy}
          data-testid="find-student-submit"
          sx={{ mt: 2.75 }}
        >
          Procurar
        </Button>
      </Box>

      {found !== "none" && found === null && (
        <Alert status="info">
          Nenhum aluno com este e-mail. Peça que ele crie a conta primeiro — o vínculo é feito
          depois do cadastro.
        </Alert>
      )}

      {found !== "none" && found !== null && (
        <Box
          data-testid="student-search-result"
          data-student-id={found.studentId}
          data-has-teacher={String(found.hasTeacher)}
          data-is-mine={String(found.isMine)}
          sx={(theme) => ({
            display: "flex",
            alignItems: "center",
            gap: 1,
            flexWrap: "wrap",
            mt: 1.5,
            p: 1.5,
            borderRadius: `${theme.brand.radius.md}px`,
            border: `1px solid ${theme.vars.palette.surface.border}`,
          })}
        >
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography sx={{ fontSize: "0.875rem", fontWeight: 600 }} noWrap>
              {found.name ?? "Sem nome"}
            </Typography>
            <Typography variant="caption" component="p">
              {found.isMine
                ? "Já é seu aluno."
                : found.hasTeacher
                  ? "Já tem professor."
                  : "Sem professor — dá para assumir."}
            </Typography>
          </Box>

          {!found.hasTeacher && (
            <Button
              type="button"
              variant="contained"
              size="small"
              disabled={busy}
              data-testid="link-student"
              onClick={() => void link(found.studentId)}
            >
              Assumir
            </Button>
          )}
        </Box>
      )}
    </Box>
  );
}
