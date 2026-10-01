import AssignmentIcon from "@mui/icons-material/AssignmentOutlined";
import TrophyIcon from "@mui/icons-material/EmojiEventsOutlined";
import GavelIcon from "@mui/icons-material/GavelOutlined";
import StyleIcon from "@mui/icons-material/StyleOutlined";
import DateRangeIcon from "@mui/icons-material/DateRangeOutlined";
import BarChartIcon from "@mui/icons-material/BarChartOutlined";
import EventRepeatIcon from "@mui/icons-material/EventRepeatOutlined";
import TodayIcon from "@mui/icons-material/CalendarMonthOutlined";
import HourglassIcon from "@mui/icons-material/HourglassEmptyOutlined";
import MenuBookIcon from "@mui/icons-material/MenuBookOutlined";
import DescriptionIcon from "@mui/icons-material/DescriptionOutlined";
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

  // Organização por tarefa: rotina, materiais e acompanhamento.
  const groups: NavGroup[] = [
    {
      title: "Minha rotina",
      items: [
        {
          href: ROUTES.student.overview,
          label: "Minha semana",
          icon: <DateRangeIcon fontSize="small" />,
          enabled: session.hasAccess,
        },
        {
          href: ROUTES.student.planning,
          label: "Meu curso",
          icon: <TodayIcon fontSize="small" />,
          enabled: session.hasAccess,
        },
        {
          href: ROUTES.student.theory,
          label: "Aulas",
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
          href: ROUTES.student.reviews,
          label: "Revisões",
          icon: <EventRepeatIcon fontSize="small" />,
          enabled: session.hasAccess,
        },
      ],
    },
    {
      title: "Materiais",
      items: [
        {
          href: ROUTES.student.laws,
          label: "Leis",
          icon: <GavelIcon fontSize="small" />,
          enabled: session.hasAccess,
        },
        {
          href: ROUTES.student.flashcards,
          label: "Flashcards",
          icon: <StyleIcon fontSize="small" />,
          enabled: session.hasAccess,
        },
        {
          href: ROUTES.student.flashSummaries,
          label: "Resumos Flash",
          icon: <DescriptionIcon fontSize="small" />,
          enabled: session.hasAccess,
        },
      ],
    },
    {
      title: "Desempenho",
      items: [
        {
          href: ROUTES.student.mockExams,
          label: "Simulados",
          icon: <TrophyIcon fontSize="small" />,
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
      timerHref={ROUTES.student.timer}
      timerRecordHref={`${ROUTES.student.overview}?estudoExtra=cronometro`}
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
