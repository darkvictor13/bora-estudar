import { useActionState, useEffect } from "react";
import { useNavigate, useRevalidator } from "react-router";

import type { FormState } from "@/lib/auth/actions";

export type FormAction = (prev: FormState, data: FormData) => Promise<FormState>;

/**
 * `useActionState` mais o que o Next fazia por conta própria.
 *
 * No servidor, uma action terminava em `redirect()` ou em `revalidatePath()` e
 * o framework cuidava do resto. Aqui não existe framework: a action devolve o
 * que quer que aconteça, e este hook executa. São os dois casos:
 *
 *  - `redirectTo` → navega. É o que `signIn`, `signUp`, `updatePassword`,
 *    `registerQuizTime` e `cancelQuizSession` usam.
 *  - `success` sem destino → revalida os loaders das rotas casadas, que é o
 *    `revalidatePath`. É o que `updateProfile`, `saveWaitlistEntry` e
 *    `generateWeek` usam: a tela fica onde está e o dado nela precisa refletir
 *    a gravação.
 *
 * O `useActionState` do React 19 não tem nada de Next nem de servidor: aceita
 * função async comum. É por isso que os formulários desta aplicação
 * atravessaram a migração sem mudar de forma.
 */
export function useFormActionState(action: FormAction) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(action, {});

  // Dentro de uma rota de dados os dois são estáveis — `useNavigate` é
  // memoizado em [router, id] e `revalidate` em [router], e o router é criado
  // uma vez fora do React. Por isso podem entrar na lista de dependências sem
  // provocar laço: o efeito roda quando `state` muda, e só.
  const navigate = useNavigate();
  const { revalidate } = useRevalidator();

  useEffect(() => {
    if (state.redirectTo) {
      void navigate(state.redirectTo);
      return;
    }
    if (state.success) void revalidate();
  }, [state, navigate, revalidate]);

  return [state, formAction, pending] as const;
}
