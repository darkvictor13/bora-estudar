import type { Metadata } from "next";
import { DM_Mono, DM_Sans } from "next/font/google";
import Script from "next/script";
import "./globals.css";

const dmSans = DM_Sans({
  variable: "--next-font-sans",
  subsets: ["latin"],
  display: "swap",
});

const dmMono = DM_Mono({
  variable: "--next-font-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Bora Estudar",
    template: "%s | Bora Estudar",
  },
  description: "Organize seus estudos com o Bora Estudar.",
};

const appearanceInitializer = `
(() => {
  try {
    const root = document.documentElement;
    const savedTheme = localStorage.getItem("be-theme");
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const theme = savedTheme === "dark" || savedTheme === "light"
      ? savedTheme
      : prefersDark ? "dark" : "light";
    const savedProfile = localStorage.getItem("be-profile");
    const profile = ["aluno", "professor", "admin"].includes(savedProfile ?? "")
      ? savedProfile
      : "aluno";

    if (theme === "dark") root.dataset.theme = "dark";
    else delete root.dataset.theme;
    root.dataset.profile = profile;
  } catch {}
})();
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="pt-BR"
      className={`${dmSans.variable} ${dmMono.variable}`}
      data-profile="aluno"
      suppressHydrationWarning
    >
      <body>
        {children}
        <Script id="be-appearance" strategy="beforeInteractive">
          {appearanceInitializer}
        </Script>
      </body>
    </html>
  );
}
