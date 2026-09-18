import BarChartIcon from "@mui/icons-material/BarChartOutlined";
import ClassIcon from "@mui/icons-material/ClassOutlined";
import EventRepeatIcon from "@mui/icons-material/EventRepeatOutlined";
import GroupIcon from "@mui/icons-material/GroupsOutlined";
import LibraryIcon from "@mui/icons-material/LibraryBooksOutlined";
import MenuBookIcon from "@mui/icons-material/MenuBookOutlined";
import PersonIcon from "@mui/icons-material/PersonOutlineOutlined";
import TargetIcon from "@mui/icons-material/AdjustOutlined";
import TodayIcon from "@mui/icons-material/CalendarMonthOutlined";
import { Outlet, useLoaderData } from "react-router";

import { AppShell, type NavGroup } from "@/components/AppShell";
import { api } from "@/lib/api";
import { requireRole } from "@/lib/auth/session";
import { useSignOut } from "@/lib/auth/useSignOut";
import { ROUTES } from "@/lib/routes";
import { adoptTheme, DEFAULT_THEME } from "@/lib/theme";
import { useSidebar } from "@/lib/ui/useSidebar";

export async function teacherLayoutLoader() {
  const session = await requireRole("teacher");
  const theme = await api.loadThemePreference();

  adoptTheme(session.profileId, theme);

  return { profileId: session.profileId, theme: theme ?? DEFAULT_THEME, name: session.name };
}

type LoaderData = Awaited<ReturnType<typeof teacherLayoutLoader>>;

export function TeacherLayout() {
  const session = useLoaderData() as LoaderData;
  const signOut = useSignOut();
  const sidebar = useSidebar();

  // Os três grupos da v2 (`professor.html`): quem são os alunos, como o estudo
  // deles é montado, e o que os números dizem depois.
  const groups: NavGroup[] = [
    {
      title: "Visão geral",
      items: [
        {
          href: ROUTES.teacher.students,
          label: "Meus alunos",
          icon: <GroupIcon fontSize="small" />,
        },
        {
          href: ROUTES.teacher.classes,
          label: "Turmas",
          icon: <ClassIcon fontSize="small" />,
        },
      ],
    },
    {
      title: "Gestão do estudo",
      items: [
        {
          href: ROUTES.teacher.plans,
          label: "Planejamentos",
          icon: <TodayIcon fontSize="small" />,
        },
        {
          href: ROUTES.teacher.theory,
          label: "Catálogo de teoria",
          icon: <LibraryIcon fontSize="small" />,
        },
        {
          href: ROUTES.teacher.notebooks,
          label: "Cadernos TEC",
          icon: <MenuBookIcon fontSize="small" />,
        },
        { href: ROUTES.teacher.goals, label: "Gerar metas", icon: <TargetIcon fontSize="small" /> },
        {
          href: ROUTES.teacher.reviews,
          label: "Revisões",
          icon: <EventRepeatIcon fontSize="small" />,
        },
      ],
    },
    {
      title: "Análise",
      items: [
        {
          href: ROUTES.teacher.statistics,
          label: "Estatísticas",
          icon: <BarChartIcon fontSize="small" />,
        },
      ],
    },
    {
      title: "Conta",
      items: [
        { href: ROUTES.teacher.account, label: "Meus dados", icon: <PersonIcon fontSize="small" /> },
      ],
    },
  ];

  return (
    <AppShell
      groups={groups}
      userName={session.name}
      profileId={session.profileId}
      theme={session.theme}
      roleLabel="Professor"
      signOutAction={signOut}
      collapsed={sidebar.collapsed}
      onToggle={sidebar.toggle}
    >
      <Outlet />
    </AppShell>
  );
}
