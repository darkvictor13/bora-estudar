import { AppShell } from "@/components/navigation/AppShell";
import { requireRole } from "@/lib/auth/guards";
import { adminArea } from "@/lib/routes/registry";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireRole("admin");
  return <AppShell role="admin" areaLabel={adminArea.label} navigation={adminArea.navigation}>{children}</AppShell>;
}
