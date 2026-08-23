import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router/dom";

// Fonte auto-hospedada. O next/font fazia isso no build; aqui é um import de
// CSS que o Vite resolve para um arquivo no bundle. O que importa é continuar
// sem requisição para fonts.googleapis.com: a suíte e2e proíbe rede externa.
import "@fontsource-variable/geist";
import "@/styles/globals.css";

import { router } from "@/router";

const container = document.getElementById("root");
if (!container) throw new Error("elemento #root não existe em index.html");

createRoot(container).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
