/**
 * Variáveis de ambiente, validadas no carregamento do módulo.
 *
 * Falhar aqui, na subida, é melhor do que descobrir a chave ausente na
 * primeira consulta ao banco — o erro do Supabase nesse caso é genérico e
 * manda o time procurar no lugar errado.
 */

function obrigatoria(nome: string, valor: string | undefined): string {
  if (!valor || valor.trim() === "") {
    throw new Error(
      `Variável de ambiente ausente: ${nome}. Copie .env.example para .env.local ` +
        `e preencha com a saída de \`supabase status\`.`,
    );
  }
  return valor;
}

// Referenciadas pelo nome completo, e não por índice: o Next só substitui
// process.env.NEXT_PUBLIC_* no bundle do cliente quando o acesso é literal.
export const env = {
  supabaseUrl: obrigatoria("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL),
  supabasePublishableKey: obrigatoria(
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  ),
} as const;
