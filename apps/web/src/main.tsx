// O RELATO DE ERRO VEM PRIMEIRO, E A ORDEM É A RAZÃO DE ELE SER UM MÓDULO.
//
// Importação é hoisted e avaliada na ordem em que aparece: qualquer import
// abaixo deste chega até `lib/env.ts`, que LANÇA quando falta uma `VITE_*`. Um
// `Sentry.init()` escrito no corpo deste arquivo nunca rodaria nesse caso — que
// é o deploy compilado sem as variáveis, a tela branca, o erro que mais
// interessa relatar. Ligar por efeito de importação, aqui em cima, é o que o
// torna capaz de relatar a própria subida.
import "@/lib/observability";

import { reactErrorHandler } from "@sentry/react";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router/dom";

// AS DUAS FONTES DA v2, AUTO-HOSPEDADAS.
//
// A v2 puxava as duas de `fonts.googleapis.com`; aqui são imports de CSS que o
// Vite resolve para arquivos do bundle. É requisito, não preferência: a suíte
// e2e proíbe requisição para domínio de terceiro.
//
// DM Sans entra na versão variável — um arquivo cobre o eixo de peso inteiro,
// 37 KB no subconjunto latin. DM Mono não tem versão variável e NÃO TEM
// NEGRITO: o pacote publica 300, 400 e 500, e são os dois pesos que os números
// usam que entram aqui. Pedir 700 faria o navegador sintetizar um falso-negrito
// — ver `monoWeight` em @bora/ui.
//
// Só o latin é baixado em pt-BR: os `@font-face` vêm com `unicode-range`, e
// toda a acentuação portuguesa cabe no bloco latin.
import "@fontsource-variable/dm-sans";
import "@fontsource/dm-mono/400.css";
import "@fontsource/dm-mono/500.css";

// NÃO HÁ MAIS CSS PRÓPRIO. `globals.css` saiu na Fase 7 junto com a última tela
// que o usava: toda cor, medida e estado agora vêm do tema de `@bora/ui`, e o
// `CssBaseline` do `RootLayout` é quem pinta o documento. As duas únicas
// ocorrências de `class=` que sobraram no código são texto dentro de
// comentário, explicando de onde a marcação da v2 veio.

import { router } from "@/router";

const container = document.getElementById("root");
if (!container) throw new Error("elemento #root não existe em index.html");

// `onUncaughtError` é o erro de renderização que NENHUM `ErrorBoundary` pegou.
// O que um boundary pega fica de fora de propósito: `routes/RouteError.tsx`
// relata esses, e só ele sabe distinguir defeito de estado — acesso vencido
// passa por lá às dezenas e não é falha. Ligar `onCaughtError` aqui relataria
// os dois, duplicado e sem filtro.
//
// O `console.error` do retorno de chamada REPÕE o que o React fazia sozinho:
// passar um manipulador SUBSTITUI o padrão, e sem isto o erro sumiria do
// console do navegador — que é onde se depura localmente, e é o que a fixture
// `consoleErrors` da suíte e2e lê. `reportError` faria o mesmo e não serve:
// dispara `window.onerror`, que o SDK também escuta, e o evento sairia em
// duplicata.
const reportUncaught = reactErrorHandler((error) => {
  console.error(error);
});

createRoot(container, {
  // O adaptador existe por causa de `exactOptionalPropertyTypes`: o React
  // declara `componentStack?: string` e o SDK espera `string | null`. São o
  // mesmo dado com duas formas de dizer "não tenho".
  onUncaughtError: (error, errorInfo) => {
    reportUncaught(error, { componentStack: errorInfo.componentStack ?? null });
  },
}).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
