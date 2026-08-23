/**
 * Variáveis de ambiente, validadas no carregamento do módulo.
 *
 * Falhar aqui, na subida, é melhor do que descobrir a chave ausente na
 * primeira consulta ao banco — o erro do Supabase nesse caso é genérico e
 * manda o time procurar no lugar errado.
 */

function required(name: string, value: string | undefined): string {
  if (!value || value.trim() === "") {
    throw new Error(
      `Variável de ambiente ausente: ${name}. Copie .env.example para .env.local ` +
        `e preencha com a saída de \`supabase status\`.`,
    );
  }
  return value;
}

// Referenciadas pelo nome completo, e não por índice: o Vite faz substituição
// estática de `import.meta.env.VITE_*` no bundle, e só reconhece o acesso
// literal. `import.meta.env[nome]` compila para undefined em produção.
export const env = {
  supabaseUrl: required("VITE_SUPABASE_URL", import.meta.env.VITE_SUPABASE_URL),
  supabasePublishableKey: required(
    "VITE_SUPABASE_PUBLISHABLE_KEY",
    import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
  ),
} as const;
