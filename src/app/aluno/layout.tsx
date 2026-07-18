import { AppShell } from "@/components/navigation/AppShell";
import { requireRole } from "@/lib/auth/guards";
import { studentArea } from "@/lib/routes/registry";

export default async function AlunoLayout({ children }: { children: React.ReactNode }) {
  await requireRole("aluno");
  return <AppShell role="aluno" areaLabel={studentArea.label} navigation={studentArea.navigation}>{children}</AppShell>;
}
