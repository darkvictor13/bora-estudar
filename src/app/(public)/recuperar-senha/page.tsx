import type { Metadata } from "next";

import { AuthScreen } from "@/components/auth/AuthScreen";

export const metadata: Metadata = { title: "Recuperar senha" };

export default function RecoverPasswordPage() {
  return <AuthScreen initialView="recover" />;
}
