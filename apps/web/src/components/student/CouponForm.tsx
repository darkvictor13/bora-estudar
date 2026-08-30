import { useState } from "react";
import { useFormStatus } from "react-dom";

import { Alert, Card, Field } from "@/components/ui";
import { useFormActionState } from "@/lib/forms/useFormActionState";
import { redeemCoupon } from "@/lib/data/account-actions";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn--primary" disabled={pending}>
      {pending ? "Resgatando…" : "Resgatar cupom"}
    </button>
  );
}

/**
 * Resgate de cupom — spec 30.
 *
 * `requestId` é um campo oculto preenchido pelo LOADER, uma vez por carga da
 * tela. Gerá-lo no envio faria cada tentativa chegar ao banco como resgate
 * novo, consumindo outro uso do cupom a cada clique — é a terceira das três
 * ordenações do `CLAUDE.md`.
 */
export function CouponForm({ requestId }: { requestId: string }) {
  const [state, formAction] = useFormActionState(redeemCoupon);
  // Campo CONTROLADO: o React 19 reseta o formulário quando a action termina,
  // inclusive quando ela devolve erro. Com o campo solto, quem errasse o código
  // perderia o que digitou e teria de datilografar tudo de novo.
  const [code, setCode] = useState("");

  return (
    <Card
      title="Tem um cupom?"
      sub="Um cupom libera seu acesso na hora, pelo prazo que ele conceder."
    >
      {state.error && <Alert kind="error">{state.error}</Alert>}
      <form action={formAction} noValidate>
        <input type="hidden" name="requestId" value={requestId} />
        <Field
          label="Código do cupom"
          name="code"
          placeholder="CUPOM3MESES"
          autoComplete="off"
          required
          value={code}
          onChange={(event) => setCode(event.target.value)}
        />
        <Submit />
      </form>
      <p className="field__hint">
        O cupom libera o acesso às telas de estudo. O planejamento continua sendo
        montado por um professor.
      </p>
    </Card>
  );
}
