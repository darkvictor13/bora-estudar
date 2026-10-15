import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import { Alert, Badge, Card, Field, PageHeader } from "@bora/ui";
import { useState } from "react";
import { useLoaderData, useRevalidator } from "react-router";

import { ContentBody } from "@/components/AppShell";
import {
  api,
  MAX_COUPON_LENGTH,
  MAX_NAME_LENGTH,
  MAX_TITLE_LENGTH,
  MAX_WHATSAPP_LENGTH,
  MIN_BIRTH_DATE,
  type ApiError,
  type WaitlistEntry,
} from "@/lib/api";
import { requireSession } from "@/lib/auth/session";
import { todayLocal } from "@/lib/domain/dates";

/**
 * Lista de espera — o `p-listaEspera` e o `p-bloqueio` da v2, numa tela só.
 *
 * É A CASA DE QUEM AINDA NÃO TEM ACESSO. Quem se cadastra pelo site nasce
 * `pending` E SEM PROFESSOR, e o `requireStudentAccess` de toda tela de estudo
 * o manda para cá. Por isso o texto daqui nunca diz "seu professor": na
 * primeira visita não existe um, e a inscrição é o que vai fazer existir.
 * A tela precisa então fazer duas coisas ao mesmo tempo: explicar por que as
 * outras estão fechadas, e recolher o que o professor precisa para liberar.
 *
 * O CUPOM É RESGATADO AQUI (spec 30), e SÓ POR RPC: `coupons` não tem policy nem
 * grant, e o código nunca é validado no cliente. Quem já tem acesso não vê o
 * cartão — resolver o acesso é a única coisa que o cupom faz (R-CUP-13).
 */
export async function waitlistLoader({ request }: { request: Request }) {
  const session = await requireSession(request);
  return { entry: await api.loadWaitlistEntry(), email: session.email, hasAccess: session.hasAccess };
}

type LoaderData = Awaited<ReturnType<typeof waitlistLoader>>;

const STATUS: Record<WaitlistEntry["status"], { label: string; tone: "success" | "warning" | "neutral" }> = {
  waiting: { label: "Na fila", tone: "warning" },
  released: { label: "Liberado", tone: "success" },
  declined: { label: "Não seguiu", tone: "neutral" },
};

export function Waitlist() {
  const { entry, email, hasAccess } = useLoaderData() as LoaderData;
  const { revalidate } = useRevalidator();
  const [error, setError] = useState<ApiError | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, setPending] = useState(false);
  const [couponError, setCouponError] = useState<ApiError | null>(null);
  const [couponPending, setCouponPending] = useState(false);
  const [redeemed, setRedeemed] = useState(false);

  async function redeem(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const code = String(new FormData(event.currentTarget).get("coupon") ?? "");

    setCouponPending(true);
    const result = await api.redeemCoupon(code);
    setCouponPending(false);

    if (!result.ok) {
      setCouponError(result.error);
      return;
    }
    setCouponError(null);
    setRedeemed(true);
    // A casca relê o acesso: é o que abre as outras telas e some com o cartão.
    await revalidate();
  }

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
        description="O que o professor precisa saber para liberar seu acesso"
      />

      <ContentBody>
        {/*
          O AVISO DE ACESSO NÃO SE REPETE AQUI. Quem o dá é a casca
          (`StudentLayout`), uma vez, em todas as telas livres — repeti-lo nesta
          faria a pessoa ler a mesma frase duas vezes, uma embaixo da outra, e
          é o tipo de duplicata que ninguém percebe ao escrever cada tela
          sozinha.
        */}
        {/* O aviso do resgate vive AQUI, e não dentro do cartão: o cartão some quando o acesso chega. */}
        {redeemed && <Alert status="success">Acesso liberado. Bons estudos!</Alert>}
        {error && <Alert status="error">{error.message}</Alert>}
        {saved && !error && <Alert status="success">Inscrição enviada. Você está na fila.</Alert>}

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
              maxLength={MAX_NAME_LENGTH}
              invalid={error?.field === "name"}
            />
            <Field
              label="E-mail da sua conta"
              name="email"
              type="email"
              value={email}
              disabled
              readOnly
              hint="É por ele que o professor vai te encontrar."
            />
            <Field
              label="WhatsApp"
              name="whatsapp"
              defaultValue={entry?.whatsapp ?? ""}
              placeholder="(11) 90000-0000"
              required
              maxLength={MAX_WHATSAPP_LENGTH}
              invalid={error?.field === "whatsapp"}
            />
            <Field
              label="Área de interesse"
              name="interestArea"
              defaultValue={entry?.interestArea ?? ""}
              placeholder="Carreira policial"
              required
              maxLength={MAX_NAME_LENGTH}
              invalid={error?.field === "interestArea"}
            />
            <Field
              label="Concurso alvo"
              name="targetExam"
              defaultValue={entry?.targetExam ?? ""}
              placeholder="Receita Federal — Auditor"
              required
              maxLength={MAX_TITLE_LENGTH}
              invalid={error?.field === "targetExam"}
            />
            <Field
              label="Data de nascimento"
              name="birthDate"
              type="date"
              defaultValue={entry?.birthDate ?? ""}
              min={MIN_BIRTH_DATE}
              max={todayLocal()}
              invalid={error?.field === "birthDate"}
            />

            <Button type="submit" variant="contained" disabled={pending}>
              {pending ? "Enviando…" : entry ? "Atualizar inscrição" : "Entrar na lista"}
            </Button>
          </Box>
        </Card>

        {!hasAccess && (
          <Box sx={{ mt: 1.75 }}>
            <Card title="Tem um cupom?" sub="O código libera o acesso na hora.">
              <Box component="form" noValidate onSubmit={redeem} data-testid="coupon-form">
                {couponError && <Alert status="error">{couponError.message}</Alert>}
                <Field
                  label="Código do cupom"
                  name="coupon"
                  autoComplete="off"
                  placeholder="CUPOM3MESES"
                  required
                  maxLength={MAX_COUPON_LENGTH}
                  invalid={couponError?.field === "coupon"}
                />
                <Button type="submit" variant="outlined" disabled={couponPending}>
                  {couponPending ? "Resgatando…" : "Resgatar"}
                </Button>
              </Box>
            </Card>
          </Box>
        )}
      </ContentBody>
    </>
  );
}
