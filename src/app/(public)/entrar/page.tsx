import type { Metadata } from "next";

import { AuthScreen } from "@/components/auth/AuthScreen";

export const metadata: Metadata = { title: "Entrar" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ proximo?: string }> }) {
  const { proximo } = await searchParams;
  return <AuthScreen nextPath={proximo} />;
}
