import { redirect } from "next/navigation";

import { getNavigationSession, homeForRole } from "@/lib/auth/session";

export default async function Home() {
  const session = await getNavigationSession();

  redirect(session ? homeForRole(session.role) : "/entrar");
}
