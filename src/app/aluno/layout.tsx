import { AppShell } from "@/components/navigation/AppShell";
import { getStudentAcademicAccessState } from "@/lib/auth/guards";
import { studentArea, studentNavigationForAcademicAccess } from "@/lib/routes/registry";

export default async function AlunoLayout({ children }: { children: React.ReactNode }) {
  const { isActive } = await getStudentAcademicAccessState();
  const navigation = studentNavigationForAcademicAccess(isActive);

  return <AppShell role="aluno" areaLabel={studentArea.label} navigation={navigation}>{children}</AppShell>;
}
