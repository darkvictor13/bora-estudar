import type { Metadata } from "next";

import { AuthScreen } from "@/components/auth/AuthScreen";

export const metadata: Metadata = { title: "Redefinir senha" };

export default function ResetPasswordPage() {
  return <AuthScreen initialView="reset" />;
}
