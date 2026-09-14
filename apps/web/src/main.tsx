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

createRoot(container).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
