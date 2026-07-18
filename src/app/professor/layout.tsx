import { AppShell } from "@/components/navigation/AppShell";
import { requireRole } from "@/lib/auth/guards";
import { professorArea } from "@/lib/routes/registry";

export default async function ProfessorLayout({ children }: { children: React.ReactNode }) {
  await requireRole("professor");
  return <AppShell role="professor" areaLabel={professorArea.label} navigation={professorArea.navigation}>{children}</AppShell>;
}
