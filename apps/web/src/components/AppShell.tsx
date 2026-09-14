import MenuIcon from "@mui/icons-material/MenuOutlined";
import Box from "@mui/material/Box";
import Divider from "@mui/material/Divider";
import Drawer from "@mui/material/Drawer";
import IconButton from "@mui/material/IconButton";
import List from "@mui/material/List";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemIcon from "@mui/material/ListItemIcon";
import ListItemText from "@mui/material/ListItemText";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import useMediaQuery from "@mui/material/useMediaQuery";
import { useTheme } from "@mui/material/styles";
import type { ReactNode } from "react";
import { Link, useLocation } from "react-router";

import { ThemeToggle } from "@/components/ThemeToggle";
import type { Theme } from "@/lib/theme";

/**
 * As quatro larguras da barra, em pixels. São as da v2.
 *
 * `OPEN` e `COLLAPSED` são a escolha da pessoa. `NARROW` e `TINY` são
 * imposição da tela: abaixo de 820px a v2 recolhe a barra QUER A PESSOA QUEIRA
 * OU NÃO, porque 220px de menu num aparelho de 700px é quase um terço da
 * largura útil.
 */
const WIDTH_OPEN = 220;
const WIDTH_COLLAPSED = 64;
const WIDTH_NARROW = 74;
const WIDTH_TINY = 58;

export interface NavItem {
  readonly href: string;
  readonly label: string;
  readonly icon: ReactNode;
  /** `false` deixa o item visível mas inerte, para o aluno sem acesso liberado. */
  readonly enabled?: boolean | undefined;
}

export interface NavGroup {
  readonly title: string;
  readonly items: readonly NavItem[];
}

/**
 * As iniciais que cabem no avatar.
 *
 * Primeira e última palavra, no máximo duas letras: "Gabriel Luis Menezes" dá
 * "GM". Um nome de uma palavra dá uma letra só, e ninguém sem nome dá "?" —
 * `profiles.name` é nullable no schema, e um avatar vazio parece defeito.
 */
function initials(name: string | null): string {
  const words = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  const first = words[0]?.[0] ?? "";
  const last = words.length > 1 ? (words[words.length - 1]?.[0] ?? "") : "";
  return (first + last).toUpperCase();
}

function Brand({
  collapsed,
  showToggle,
  onToggle,
}: {
  collapsed: boolean;
  showToggle: boolean;
  onToggle: () => void;
}) {
  return (
    <Box
      sx={(theme) => ({
        display: "flex",
        alignItems: "center",
        gap: 1,
        minHeight: 64,
        px: collapsed ? 1 : 1.25,
        py: 1.75,
        borderBottom: `1px solid ${theme.vars.palette.surface.border}`,
      })}
    >
      {!collapsed && (
      <Box
        aria-hidden="true"
        sx={(theme) => ({
          flex: "0 0 30px",
          width: 30,
          height: 30,
          display: "grid",
          placeItems: "center",
          borderRadius: "50%",
          backgroundColor: theme.vars.palette.fill.primary,
          color: theme.vars.palette.fill.primaryText,
          fontFamily: theme.typography.numeric.fontFamily,
          fontWeight: 500,
          fontSize: "0.6875rem",
          letterSpacing: "-0.06em",
        })}
      >
        BE
      </Box>
      )}

      {!collapsed && (
        <Box sx={{ minWidth: 0, flex: 1 }}>
          {/*
            EM MONO, EM PESO 500 — a v2 pedia 700 aqui, e DM Mono não publica
            negrito: o navegador sintetizava um falso-negrito, com traço
            engordado de forma irregular. A ênfase vem do espacejamento, que é
            o que a marca sempre teve.
          */}
          <Typography
            variant="numeric"
            component="div"
            sx={{ fontSize: "0.59375rem", letterSpacing: "0.105em", lineHeight: 1.2 }}
          >
            BORA ESTUDAR
          </Typography>
          <Typography
            variant="numeric"
            component="div"
            sx={(theme) => ({
              fontSize: "0.53125rem",
              letterSpacing: "0.17em",
              lineHeight: 1.2,
              marginTop: "2px",
              color: theme.vars.palette.accent.secondary,
            })}
          >
            CONCURSOS
          </Typography>
        </Box>
      )}

      {/*
        O rótulo diz o que VAI acontecer; o `aria-expanded` diz o que É. Leitor
        de tela lê o estado, e quem enxerga lê a ação.

        Fica na MESMA linha da marca, como na v2: recolhida, a barra tem 64px e
        uma segunda linha só para este botão comeria a altura de dois itens de
        menu.
      */}
      {/* Na tela estreita o recolhimento é imposto, e um botão que não muda
          nada é pior do que botão nenhum. */}
      {showToggle && (
      <Tooltip title={collapsed ? "Expandir menu" : "Recolher menu"} placement="right">
        <IconButton
          type="button"
          size="small"
          data-testid="sidebar-toggle"
          aria-label={collapsed ? "Expandir menu" : "Recolher menu"}
          aria-expanded={!collapsed}
          aria-controls="sidebar-nav"
          onClick={onToggle}
          sx={(theme) => ({
            flexShrink: 0,
            ...(collapsed ? { mx: "auto" } : { ml: "auto" }),
            border: `1px solid ${theme.vars.palette.surface.border}`,
          })}
        >
          <MenuIcon fontSize="small" />
        </IconButton>
      </Tooltip>
      )}
    </Box>
  );
}

export function AppShell({
  groups,
  userName,
  roleLabel,
  profileId,
  theme,
  signOutAction,
  collapsed,
  onToggle,
  children,
}: {
  groups: readonly NavGroup[];
  userName: string | null;
  roleLabel: string;
  profileId: string;
  theme: Theme;
  signOutAction: () => Promise<void>;
  collapsed: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  const { pathname } = useLocation();
  const muiTheme = useTheme();

  /**
   * A tela estreita RECOLHE À FORÇA, e é por isso que `compact` existe ao lado
   * de `collapsed`.
   *
   * `collapsed` é a preferência do aparelho, guardada em `localStorage`.
   * `compact` é o que a barra de fato mostra. Abaixo de `lg` (820px, o
   * breakpoint da v2) os dois divergem: a preferência continua guardada, e
   * volta a valer assim que a janela crescer — recolher por falta de espaço
   * não pode apagar o que a pessoa escolheu para o monitor grande.
   */
  const narrow = useMediaQuery(muiTheme.breakpoints.down("lg"));
  const tiny = useMediaQuery(muiTheme.breakpoints.down("sm"));
  const compact = collapsed || narrow;

  // Casa a rota MAIS ESPECÍFICA: sem isto "/aluno" ficaria marcada como atual
  // em todas as subpáginas.
  const currentHref = groups
    .flatMap((group) => group.items)
    .map((item) => item.href)
    .filter((href) => pathname === href || pathname.startsWith(`${href}/`))
    .sort((a, b) => b.length - a.length)[0];

  const width = tiny
    ? WIDTH_TINY
    : narrow
      ? WIDTH_NARROW
      : collapsed
        ? WIDTH_COLLAPSED
        : WIDTH_OPEN;

  return (
    <Box sx={{ display: "flex", height: "100vh", overflow: "hidden" }}>
      <Drawer
        variant="permanent"
        data-testid="sidebar"
        data-collapsed={compact}
        sx={(theme) => ({
          width,
          flexShrink: 0,
          transition: theme.transitions.create("width"),
          "& .MuiDrawer-paper": {
            width,
            overflowX: "hidden",
            transition: theme.transitions.create("width"),
            backgroundColor: theme.vars.palette.surface.raised,
            borderRight: `1px solid ${theme.vars.palette.surface.border}`,
          },
        })}
      >
        <Box sx={{ display: "flex", flexDirection: "column", height: "100%" }}>
          <Brand collapsed={compact} showToggle={!narrow} onToggle={onToggle} />

          <Box id="sidebar-nav" component="nav" aria-label="Navegação principal" sx={{ flex: 1, overflowY: "auto", px: compact ? 0.875 : 1, py: 1.25 }}>
            {groups.map((group) => (
              <List
                key={group.title}
                dense
                disablePadding
                subheader={
                  compact ? undefined : (
                    <Typography
                      component="p"
                      variant="overline"
                      sx={(muiTheme) => ({
                        fontSize: "0.5625rem",
                        letterSpacing: "0.1em",
                        px: 1.25,
                        mt: 2.25,
                        mb: 0.5,
                        // `text.secondary`, e não `text.disabled`. O cinza mais
                        // claro da v2 dava 2.64:1 no claro e 2.98:1 no escuro —
                        // os dois reprovam o AA que o F-TEMA-07 mede, e num
                        // rótulo de 9px a reprovação é literal: não se lê.
                        color: muiTheme.vars.palette.text.secondary,
                      })}
                    >
                      {group.title}
                    </Typography>
                  )
                }
                sx={{ mb: compact ? 1 : 0 }}
              >
                {group.items.map((item) => {
                  const active = item.href === currentHref;
                  const disabled = item.enabled === false;

                  const button = (
                    <ListItemButton
                      key={item.href}
                      data-testid="nav-item"
                      data-active={active}
                      data-enabled={!disabled}
                      // SEM DESTINO quando desabilitado, e não um <Link> com
                      // `aria-disabled`: o Link continua navegando no clique, o
                      // loader redireciona de volta, e a pessoa dá a volta
                      // inteira para não sair do lugar.
                      {...(disabled
                        ? { disabled: true }
                        : { component: Link, to: item.href })}
                      {...(active ? { selected: true, "aria-current": "page" as const } : {})}
                      sx={(muiTheme) => ({
                        borderRadius: `${muiTheme.brand.radius.md}px`,
                        mb: "2px",
                        px: compact ? 0 : 1.25,
                        py: 1,
                        justifyContent: compact ? "center" : "flex-start",
                        ...(active && { fontWeight: 600 }),
                      })}
                    >
                      <ListItemIcon
                        sx={{
                          minWidth: compact ? 0 : 24,
                          opacity: active ? 1 : 0.65,
                          ...(active && { color: "inherit" }),
                        }}
                      >
                        {item.icon}
                      </ListItemIcon>
                      {!compact && (
                        <ListItemText
                          primary={item.label}
                          slotProps={{
                            primary: {
                              fontSize: "0.8125rem",
                              fontWeight: active ? 600 : 500,
                            },
                          }}
                        />
                      )}
                    </ListItemButton>
                  );

                  // Recolhida, o rótulo some da tela e o único jeito de saber
                  // para onde um ícone leva é parar o ponteiro em cima dele.
                  return compact ? (
                    <Tooltip key={item.href} title={item.label} placement="right">
                      <span>{button}</span>
                    </Tooltip>
                  ) : (
                    button
                  );
                })}
              </List>
            ))}
          </Box>

          <Divider />

          <Box data-testid="sidebar-foot" sx={{ p: compact ? 1 : 1.5 }}>
            {/* Acima do bloco de identidade: é preferência da conta, e a conta
                é o que este rodapé representa. */}
            <ThemeToggle profileId={profileId} initial={theme} collapsed={compact} />

            <Box
              data-testid="user-chip"
              sx={(muiTheme) => ({
                display: "flex",
                alignItems: "center",
                gap: 1.125,
                mt: 1,
                p: compact ? 1 : 1.125,
                justifyContent: compact ? "center" : "flex-start",
                borderRadius: `${muiTheme.brand.radius.lg}px`,
                backgroundColor: muiTheme.vars.palette.surface.sunken,
              })}
            >
              <Box
                aria-hidden="true"
                sx={(muiTheme) => ({
                  flexShrink: 0,
                  width: 30,
                  height: 30,
                  display: "grid",
                  placeItems: "center",
                  borderRadius: "50%",
                  backgroundColor: muiTheme.vars.palette.accent.primarySoft,
                  color: muiTheme.vars.palette.accent.primary,
                  fontSize: "0.6875rem",
                  fontWeight: 700,
                })}
              >
                {initials(userName)}
              </Box>

              {!compact && (
                <Box sx={{ minWidth: 0 }}>
                  <Typography
                    component="p"
                    noWrap
                    sx={{ fontSize: "0.75rem", fontWeight: 600 }}
                    data-testid="user-name"
                  >
                    {userName ?? "Sem nome"}
                  </Typography>
                  <Typography
                    component="p"
                    variant="caption"
                    sx={{ fontSize: "0.625rem", lineHeight: 1.2 }}
                  >
                    {roleLabel}
                  </Typography>
                </Box>
              )}
            </Box>

            {/*
              Continua um <form> com botão de submit, e não um <button onClick>:
              o React 19 aceita função async comum como `action` — não é nada
              específico de Server Action — e um submit de verdade é o que faz o
              Enter funcionar e o botão anunciar-se como envio.
            */}
            <Box component="form" action={signOutAction} sx={{ mt: 1 }}>
              <ListItemButton
                component="button"
                type="submit"
                data-testid="sign-out"
                sx={(muiTheme) => ({
                  width: "100%",
                  justifyContent: "center",
                  borderRadius: `${muiTheme.brand.radius.md}px`,
                  fontSize: "0.8125rem",
                  fontWeight: 500,
                  border: `1px solid ${muiTheme.vars.palette.surface.controlBorder}`,
                })}
              >
                Sair
              </ListItemButton>
            </Box>
          </Box>
        </Box>
      </Drawer>

      {/*
        O SCROLLER É O <main>, e não o documento. É o que faz o `position:
        sticky` do PageHeader parar no topo da área de conteúdo em vez de sumir
        junto com a rolagem da página — e é como a v2 se comporta.
      */}
      <Box
        component="main"
        data-testid="content"
        sx={(muiTheme) => ({
          flex: 1,
          minWidth: 0,
          overflowY: "auto",
          backgroundColor: muiTheme.vars.palette.surface.base,
        })}
      >
        {children}
      </Box>
    </Box>
  );
}

/** O corpo de uma tela: o `.content` da v2, com o padding dela. */
export function ContentBody({ children }: { children: ReactNode }) {
  return (
    <Box
      sx={(muiTheme) => ({
        px: 4,
        py: 3,
        [muiTheme.breakpoints.down("md")]: { px: 2, py: 2 },
      })}
    >
      {children}
    </Box>
  );
}
