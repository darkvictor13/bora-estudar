import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Typography from "@mui/material/Typography";
import { Alert, Badge, Card, Field, PageHeader } from "@bora/ui";
import { useState } from "react";
import { useLoaderData, useRevalidator } from "react-router";

import { ContentBody } from "@/components/AppShell";
import { api, type ApiError, type WaitlistEntry } from "@/lib/api";
import { requireSession } from "@/lib/auth/session";

/**
 * Lista de espera — o `p-listaEspera` e o `p-bloqueio` da v2, numa tela só.
 *
 * É A CASA DE QUEM AINDA NÃO TEM ACESSO. Quem se cadastra pelo site nasce
 * `pending`, e o `requireStudentAccess` de toda tela de estudo o manda para cá.
 * A tela precisa então fazer duas coisas ao mesmo tempo: explicar por que as
 * outras estão fechadas, e recolher o que o professor precisa para liberar.
 *
 * O CUPOM NÃO ESTÁ AQUI, e a ausência é deliberada. `coupons` está sem policy e
 * sem grant — de propósito: validar o código no cliente entregaria a lista de
 * códigos a quem pedir. O resgate precisa nascer como RPC, e oferecer o campo
 * antes disso seria culpar quem digitou o código certo.
 */
export async function waitlistLoader() {
  const session = await requireSession();
  return { entry: await api.loadWaitlistEntry(), email: session.email };
}

type LoaderData = Awaited<ReturnType<typeof waitlistLoader>>;

const STATUS: Record<WaitlistEntry["status"], { label: string; tone: "success" | "warning" | "neutral" }> = {
  waiting: { label: "Na fila", tone: "warning" },
  released: { label: "Liberado", tone: "success" },
  declined: { label: "Não seguiu", tone: "neutral" },
};

export function Waitlist() {
  const { entry, email } = useLoaderData() as LoaderData;
  const { revalidate } = useRevalidator();
  const [error, setError] = useState<ApiError | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, setPending] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const text = (name: string) => String(data.get(name) ?? "").trim();

    setPending(true);
    const result = await api.joinWaitlist({
      name: text("name"),
      // O E-MAIL É O DA CONTA, e não o que a pessoa digitar. A policy
      // `waitlist_insert_student` compara com o e-mail do JWT: qualquer outro é
      // recusado pelo banco. O campo existe para conferir, não para escolher.
      email,
      whatsapp: text("whatsapp"),
      interestArea: text("interestArea"),
      targetExam: text("targetExam"),
      // O fuso vem do navegador: é onde a pessoa está, e é o que o professor
      // precisa para marcar conversa sem perguntar.
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      ...(text("birthDate") ? { birthDate: text("birthDate") } : {}),
    });
    setPending(false);

    if (!result.ok) {
      setError(result.error);
      setSaved(false);
      return;
    }
    setError(null);
    setSaved(true);
    await revalidate();
  }

  return (
    <>
      <PageHeader
        title="Lista de espera"
        description="O que seu professor precisa saber para liberar seu acesso"
      />

      <ContentBody>
        {/*
          O AVISO DE ACESSO NÃO SE REPETE AQUI. Quem o dá é a casca
          (`StudentLayout`), uma vez, em todas as telas livres — repeti-lo nesta
          faria a pessoa ler a mesma frase duas vezes, uma embaixo da outra, e
          é o tipo de duplicata que ninguém percebe ao escrever cada tela
          sozinha.
        */}
        {error && <Alert status="error">{error.message}</Alert>}
        {saved && !error && <Alert status="success">Inscrição enviada ao seu professor.</Alert>}

        <Card
          title={entry ? "Sua inscrição" : "Entrar na lista"}
          sub={
            entry
              ? "Você pode corrigir o que enviou enquanto o professor não responde."
              : "Leva um minuto."
          }
          action={entry ? <Badge tone={STATUS[entry.status].tone}>{STATUS[entry.status].label}</Badge> : undefined}
        >
          <Box component="form" noValidate onSubmit={submit} data-testid="waitlist-form">
            <Field
              label="Nome completo"
              name="name"
              defaultValue={entry?.name ?? ""}
              required
              invalid={error?.field === "name"}
            />
            <Field
              label="E-mail da sua conta"
              name="email"
              type="email"
              value={email}
              disabled
              readOnly
              hint="É por ele que seu professor vai te encontrar."
            />
            <Field
              label="WhatsApp"
              name="whatsapp"
              defaultValue={entry?.whatsapp ?? ""}
              placeholder="(11) 90000-0000"
              required
              invalid={error?.field === "whatsapp"}
            />
            <Field
              label="Área de interesse"
              name="interestArea"
              defaultValue={entry?.interestArea ?? ""}
              placeholder="Fiscal, policial, tribunais…"
            />
            <Field
              label="Concurso alvo"
              name="targetExam"
              defaultValue={entry?.targetExam ?? ""}
              placeholder="Receita Federal — Auditor"
              required
              invalid={error?.field === "targetExam"}
            />
            <Field
              label="Data de nascimento"
              name="birthDate"
              type="date"
              defaultValue={entry?.birthDate ?? ""}
            />

            <Button type="submit" variant="contained" disabled={pending}>
              {pending ? "Enviando…" : entry ? "Atualizar inscrição" : "Entrar na lista"}
            </Button>
          </Box>
        </Card>

        <Box sx={{ mt: 1.75 }}>
          <Card title="Tem um cupom?">
            <Typography variant="body2">
              O resgate de cupom está sendo reescrito para acontecer no servidor. Enquanto isso,
              envie o código ao seu professor — ele libera o acesso pela ficha do aluno.
            </Typography>
          </Card>
        </Box>
      </ContentBody>
    </>
  );
}
