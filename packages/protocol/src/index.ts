/**
 * Contrato entre o site e a extensão de navegador.
 *
 * Este pacote é a ÚNICA definição do protocolo. Site e extensão importam daqui;
 * nenhum dos dois redefine as formas localmente. Na versão anterior do produto
 * as duas pontas mantinham cópias próprias e derivaram entre si, o que só
 * aparecia em runtime quando um payload chegava com um campo faltando.
 *
 * O transporte é o fragmento (#) da URL, porque ele nunca é enviado ao servidor
 * e não aparece em log de acesso.
 */

export * from "./envelope.ts";
export * from "./messages.ts";
export * from "./codec.ts";
