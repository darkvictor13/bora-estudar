import type { Metadata } from "next";

import { AuthScreen } from "@/components/auth/AuthScreen";

export const metadata: Metadata = { title: "Cadastro" };

export default function SignUpPage() {
  return <AuthScreen initialView="signup" />;
}
