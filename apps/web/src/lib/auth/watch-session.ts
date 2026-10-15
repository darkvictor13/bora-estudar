import { supabase } from "@/lib/supabase/client";

/**
 * Avisa quando a sessão acaba, venha de onde vier (R-AUTH-20).
 *
 * O cliente do Supabase repassa o `SIGNED_OUT` para as outras abas do mesmo
 * navegador (`BroadcastChannel`) e o emite também quando o token não pode mais
 * ser renovado — sessão vencida com a aba aberta. Sem esta escuta, a aba
 * continuava mostrando dados de uma sessão que já não existe até a próxima
 * navegação disparar um loader.
 *
 * Mora em `lib/auth` porque o contrato diz que componente nenhum importa o
 * cliente do Supabase. Devolve a função que cancela a assinatura.
 */
export function watchSignedOut(onSignedOut: () => void): () => void {
  const { data } = supabase.auth.onAuthStateChange((event) => {
    if (event === "SIGNED_OUT") onSignedOut();
  });
  return () => data.subscription.unsubscribe();
}
