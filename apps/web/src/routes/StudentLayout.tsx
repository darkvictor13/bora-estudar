import AssignmentIcon from "@mui/icons-material/AssignmentOutlined";
import BarChartIcon from "@mui/icons-material/BarChartOutlined";
import EventRepeatIcon from "@mui/icons-material/EventRepeatOutlined";
import GridViewIcon from "@mui/icons-material/GridViewOutlined";
import TodayIcon from "@mui/icons-material/CalendarMonthOutlined";
import HourglassIcon from "@mui/icons-material/HourglassEmptyOutlined";
import MenuBookIcon from "@mui/icons-material/MenuBookOutlined";
import PersonIcon from "@mui/icons-material/PersonOutlineOutlined";
import Box from "@mui/material/Box";
import { Alert } from "@bora/ui";
import { Outlet, useLoaderData } from "react-router";

import { AppShell, type NavGroup } from "@/components/AppShell";
import { api } from "@/lib/api";
import { requireRole } from "@/lib/auth/session";
import { useSignOut } from "@/lib/auth/useSignOut";
import { ROUTES } from "@/lib/routes";
import { adoptTheme, DEFAULT_THEME } from "@/lib/theme";
import { useSidebar } from "@/lib/ui/useSidebar";

export async function studentLayoutLoader() {
  const session = await requireRole("student");
  const theme = await api.loadThemePreference();

  // Reconcilia a cópia do aparelho com o que a conta diz, no LOADER e não num
  // efeito: efeito roda depois da pintura, e é a pintura que não pode piscar.
  adoptTheme(session.profileId, theme);

  return {
    profileId: session.profileId,
    theme: theme ?? DEFAULT_THEME,
    name: session.name,
    hasAccess: session.hasAccess,
  };
}

type LoaderData = Awaited<ReturnType<typeof studentLayoutLoader>>;

export function StudentLayout() {
  const session = useLoaderData() as LoaderData;
  const signOut = useSignOut();
  const sidebar = useSidebar();

  // Os grupos e os rótulos são os da v2 (`aluno.html`). "Metas" é o nome que o
  // aluno usa para a tela inicial — "visão geral" é jargão de quem construiu.
  const groups: NavGroup[] = [
    {
      title: "Visão geral",
      items: [
        {
          href: ROUTES.student.overview,
          label: "Metas",
          icon: <GridViewIcon fontSize="small" />,
          enabled: session.hasAccess,
        },
      ],
    },
    {
      title: "Estudo",
      items: [
        {
          href: ROUTES.student.planning,
          label: "Planejamento",
          icon: <TodayIcon fontSize="small" />,
          enabled: session.hasAccess,
        },
        {
          href: ROUTES.student.theory,
          label: "Estudo da teoria",
          icon: <MenuBookIcon fontSize="small" />,
          enabled: session.hasAccess,
        },
        {
          href: ROUTES.student.subjects,
          label: "Disciplinas",
          icon: <AssignmentIcon fontSize="small" />,
          enabled: session.hasAccess,
        },
        {
          href: ROUTES.student.notebooks,
          label: "Cadernos TEC",
          icon: <MenuBookIcon fontSize="small" />,
          enabled: session.hasAccess,
        },
        {
          href: ROUTES.student.reviews,
          label: "Controle de revisões",
          icon: <EventRepeatIcon fontSize="small" />,
          enabled: session.hasAccess,
        },
        {
          href: ROUTES.student.statistics,
          label: "Estatísticas",
          icon: <BarChartIcon fontSize="small" />,
          enabled: session.hasAccess,
        },
      ],
    },
    {
      title: "Conta",
      items: [
        { href: ROUTES.student.account, label: "Meus dados", icon: <PersonIcon fontSize="small" /> },
        {
          href: ROUTES.student.waitlist,
          label: "Lista de espera",
          icon: <HourglassIcon fontSize="small" />,
        },
      ],
    },
  ];

  return (
    <AppShell
      groups={groups}
      userName={session.name}
      profileId={session.profileId}
      theme={session.theme}
      roleLabel="Aluno"
      signOutAction={signOut}
      collapsed={sidebar.collapsed}
      onToggle={sidebar.toggle}
    >
      {!session.hasAccess && (
        <Box sx={{ px: 4, pt: 3, pb: 0 }}>
          <Alert status="warning">
            Seu acesso ainda não foi liberado. Você pode editar seus dados e entrar na lista de
            espera enquanto aguarda.
          </Alert>
        </Box>
      )}
      <Outlet />
    </AppShell>
  );
}
