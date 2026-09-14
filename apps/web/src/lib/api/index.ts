/**
 * A porta única. A interface importa daqui, e de nenhum outro lugar.
 *
 * Qual implementação atende é decidido UMA VEZ, no carregamento do módulo, por
 * variável de ambiente. Nenhum componente, loader ou action sabe qual das duas
 * está atrás — é isso que faz a integração com o banco ser uma troca de
 * implementação em vez de uma passada por todas as telas.
 *
 * O acesso a `import.meta.env` é literal de propósito: o Vite faz substituição
 * estática e só reconhece a forma escrita por extenso. Indexar por variável
 * compila para `undefined` em produção, sem aviso.
 */
import type { BoraApi } from "./contract.ts";
import { fixturesApi } from "./fixtures.ts";
import { supabaseApi } from "./supabase/index.ts";

export * from "./contract.ts";

/**
 * O PADRÃO É O BANCO, desde que a frente do banco entregou.
 *
 * Era `fixtures` enquanto o schema não existia. A inversão importa por um
 * motivo prático: o que roda sem ninguém configurar nada é o que o `npm run
 * dev` e a suíte e2e usam, e as duas precisam do banco de verdade — não há
 * como provar que o login funciona contra um objeto em memória que diz sim
 * para qualquer senha.
 *
 * `VITE_API_IMPL=fixtures` continua servindo, e é o caminho para construir uma
 * tela cuja fase ainda não escreveu o adaptador: o `supabaseApi` LANÇA nessas
 * operações, com o nome e o número da fase na mensagem.
 */
const implementation = import.meta.env.VITE_API_IMPL ?? "supabase";

export const api: BoraApi = implementation === "fixtures" ? fixturesApi : supabaseApi;

/**
 * Chave de idempotência, GERADA UMA VEZ, NA ORIGEM.
 *
 * Chame no manipulador do evento e leve o mesmo valor por toda a tentativa,
 * inclusive nas retentativas. Gerar no ponto de uso transforma a proteção do
 * servidor em decoração: cada tentativa chega como operação nova, e o banco
 * grava duas vezes o que deveria gravar uma. Já custou bateria respondida na
 * versão anterior — uma hora de estudo do aluno, que não pode ser recriada.
 */
export function newRequestId(): string {
  return crypto.randomUUID();
}
