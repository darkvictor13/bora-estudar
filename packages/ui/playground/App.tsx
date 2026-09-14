import {
  Alert,
  AppBar,
  Avatar,
  Badge,
  Box,
  Button,
  Card,
  CardActions,
  CardContent,
  CardHeader,
  Checkbox,
  Chip,
  Container,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Divider,
  FormControlLabel,
  IconButton,
  LinearProgress,
  Link,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Paper,
  Radio,
  RadioGroup,
  Skeleton,
  Slider,
  Stack,
  Switch,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tabs,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Toolbar,
  Tooltip,
  Typography,
  useColorScheme,
  useTheme,
} from '@mui/material';
import type { SxProps, Theme } from '@mui/material/styles';
import { useState } from 'react';
import { amber, neutral, petrol, schemes } from '../src/tokens.ts';

/* ------------------------------------------------------------------ */

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <Box component="section" sx={{ mb: 7 }}>
      <Typography variant="overline" sx={{ color: 'primary.main', display: 'block' }}>
        {title}
      </Typography>
      {hint && (
        <Typography variant="body2" sx={{ mb: 2.5, maxWidth: 620 }}>
          {hint}
        </Typography>
      )}
      <Box sx={{ mt: hint ? 0 : 2 }}>{children}</Box>
    </Box>
  );
}

function Grid({
  children,
  min = 260,
  sx,
}: {
  children: React.ReactNode;
  min?: number;
  sx?: SxProps<Theme>;
}) {
  return (
    <Box
      sx={[
        { display: 'grid', gap: 2, gridTemplateColumns: `repeat(auto-fill, minmax(${min}px, 1fr))` },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    >
      {children}
    </Box>
  );
}

/** Contraste WCAG calculado no cliente — a régua de acessibilidade fica visível. */
function contrast(hex: string, against: string) {
  const lum = (h: string) => {
    const v = h.replace('#', '');
    const channel = (i: number) => {
      const c = parseInt(v.slice(i, i + 2), 16) / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * channel(0) + 0.7152 * channel(2) + 0.0722 * channel(4);
  };
  const lighter = Math.max(lum(hex), lum(against));
  const darker = Math.min(lum(hex), lum(against));
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * `role="text"` mede a cor CONTRA o fundo (é assim que ela será lida).
 * `role="fill"` mede o texto que vai POR CIMA dela — num preenchimento,
 * o contraste que importa é esse, não o da cor contra a página.
 */
function Swatch({
  name,
  hex,
  bg,
  role = 'text',
  over,
}: {
  name: string;
  hex: string;
  bg: string;
  role?: 'text' | 'fill';
  over?: string;
}) {
  const ratio = role === 'fill' ? contrast(over ?? bg, hex) : contrast(hex, bg);
  return (
    <Stack spacing={0.75}>
      <Box
        sx={{
          height: 56,
          borderRadius: 1.5,
          bgcolor: hex,
          border: '1px solid',
          borderColor: 'surface.border',
        }}
      />
      <Stack direction="row" justifyContent="space-between" alignItems="baseline">
        <Typography variant="caption" sx={{ color: 'text.primary', fontWeight: 600 }}>
          {name}
        </Typography>
        <Typography variant="caption" sx={{ fontFamily: 'monospace' }}>
          {hex.toUpperCase()}
        </Typography>
      </Stack>
      <Typography variant="caption" sx={{ color: ratio >= 4.5 ? 'accent.secondary' : 'error.main' }}>
        {ratio.toFixed(1)}:1 {role === 'fill' ? 'com o texto por cima' : 'no fundo'}
        {ratio >= 7 ? ' · AAA' : ratio >= 4.5 ? ' · AA' : ' · reprova'}
      </Typography>
    </Stack>
  );
}

function Scale({ label, scale }: { label: string; scale: Record<string | number, string> }) {
  return (
    <Box sx={{ mb: 3 }}>
      <Typography variant="subtitle2" sx={{ mb: 1 }}>
        {label}
      </Typography>
      <Box
        sx={{
          display: 'flex',
          borderRadius: 1.5,
          overflow: 'hidden',
          border: '1px solid',
          borderColor: 'surface.border',
        }}
      >
        {Object.entries(scale).map(([step, hex]) => (
          <Tooltip key={step} title={`${label.toLowerCase()}[${step}] · ${hex}`} placement="top">
            <Box
              sx={{
                flex: 1,
                height: 52,
                bgcolor: hex,
                display: 'grid',
                placeItems: 'center',
                cursor: 'default',
              }}
            >
              <Typography
                variant="caption"
                sx={{
                  color: contrast(hex, '#000000') > 6 ? '#000' : '#fff',
                  fontWeight: 600,
                  opacity: 0.85,
                }}
              >
                {step}
              </Typography>
            </Box>
          </Tooltip>
        ))}
      </Box>
    </Box>
  );
}

/* ------------------------------------------------------------------ */

/**
 * Alternador de modo. `useColorScheme` grava a escolha em localStorage e
 * troca a classe do <html>; as CSS variables fazem o resto, sem re-render.
 */
function ModeToggle() {
  const { mode, setMode } = useColorScheme();
  if (!mode) return <Box sx={{ width: 186, height: 34 }} />; // evita salto antes de montar
  return (
    <ToggleButtonGroup
      size="small"
      exclusive
      value={mode}
      onChange={(_, v: 'light' | 'dark' | 'system' | null) => v && setMode(v)}
      aria-label="Modo de cor"
    >
      <ToggleButton value="light">Claro</ToggleButton>
      <ToggleButton value="dark">Escuro</ToggleButton>
      <ToggleButton value="system">Sistema</ToggleButton>
    </ToggleButtonGroup>
  );
}

/* ------------------------------------------------------------------ */

export function App() {
  const theme = useTheme();
  const { mode, systemMode } = useColorScheme();
  // 'system' precisa ser resolvido para sabermos contra qual fundo medir contraste.
  const resolved = (mode === 'system' ? systemMode : mode) ?? 'dark';
  const t = schemes[resolved];
  const [tab, setTab] = useState(0);
  const [anchor, setAnchor] = useState<null | HTMLElement>(null);
  const [dialog, setDialog] = useState(false);
  const [align, setAlign] = useState('semana');

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
      <AppBar position="sticky">
        <Toolbar sx={{ gap: 2 }}>
          <Box
            sx={{
              width: 28,
              height: 28,
              borderRadius: 1,
              bgcolor: 'fill.primary',
              display: 'grid',
              placeItems: 'center',
              fontWeight: 800,
              color: 'fill.primaryText',
              fontSize: 15,
            }}
          >
            D
          </Box>
          <Typography variant="h6" sx={{ flexGrow: 1 }}>
            Design System
          </Typography>
          <Chip label="v0.1.0" size="small" variant="outlined" sx={{ mr: 1 }} />
          <ModeToggle />
        </Toolbar>
      </AppBar>

      <Container maxWidth="lg" sx={{ py: 6 }}>
        {/* ---------------------------------------------------------- */}
        <Box sx={{ mb: 8, maxWidth: 720 }}>
          <Typography variant="h1" sx={{ mb: 2 }}>
            {resolved === 'dark' ? 'Preto' : 'Branco'},{' '}
            <Box component="span" sx={{ color: 'accent.primary' }}>âmbar</Box> e{' '}
            <Box component="span" sx={{ color: 'accent.secondary' }}>verde-petróleo</Box>.
          </Typography>
          <Typography variant="body1" sx={{ color: 'text.secondary' }}>
            Um tema, dois modos. Os preenchimentos são idênticos nos dois — âmbar com texto
            quase-preto, petróleo com texto branco. O que muda é o acento de <em>texto</em>: o âmbar
            fecha no claro, o petróleo clareia no escuro. Troque o modo no topo e compare.
          </Typography>
          <Stack direction="row" spacing={1.5} sx={{ mt: 3 }} flexWrap="wrap" useFlexGap>
            <Button size="large">Ação primária</Button>
            <Button size="large" variant="outlined" color="secondary">
              Ação secundária
            </Button>
            <Button size="large" variant="text" color="inherit">
              Terciária
            </Button>
          </Stack>
        </Box>

        {/* ---------------------------------------------------------- */}
        <Section
          title="Paleta"
          hint={`Contraste real contra o fundo do modo ${resolved === 'dark' ? 'escuro' : 'claro'}, calculado nesta página. AA pede 4.5:1. Repare que fill e accent divergem no claro (âmbar) e no escuro (petróleo) — cada cor falha como texto de um lado.`}
        >
          <Grid min={200}>
            <Swatch name="fill.primary" hex={t.fill.primary} bg={t.surface.base} role="fill" over={t.fill.primaryText} />
            <Swatch name="accent.primary" hex={t.accent.primary} bg={t.surface.base} />
            <Swatch name="fill.secondary" hex={t.fill.secondary} bg={t.surface.base} role="fill" over={t.fill.secondaryText} />
            <Swatch name="accent.secondary" hex={t.accent.secondary} bg={t.surface.base} />
            <Swatch name="text.primary" hex={t.text.primary} bg={t.surface.base} />
            <Swatch name="text.secondary" hex={t.text.secondary} bg={t.surface.base} />
            <Swatch name="error.main" hex={t.semantic.error} bg={t.surface.base} />
            <Swatch name="warning.main" hex={t.semantic.warning} bg={t.surface.base} />
            <Swatch name="info.main" hex={t.semantic.info} bg={t.surface.base} />
            <Swatch name="success.main" hex={t.semantic.success} bg={t.surface.base} />
          </Grid>

          <Box sx={{ mt: 5 }}>
            <Scale label="Amber" scale={amber} />
            <Scale label="Petrol" scale={petrol} />
            <Scale label="Neutral" scale={neutral} />
          </Box>
        </Section>

        {/* ---------------------------------------------------------- */}
        <Section
          title="Superfícies"
          hint="No escuro a sombra difusa some e a profundidade vem da cor da superfície mais a borda de 1px; no claro as sombras voltam a existir e os cards ganham elevação real."
        >
          <Grid min={200}>
            {(
              [
                ['surface.base', t.surface.base, 'fundo da aplicação'],
                ['surface.sunken', t.surface.sunken, 'inputs, áreas recuadas'],
                ['surface.raised', t.surface.raised, 'cards, paper'],
                ['surface.overlay', t.surface.overlay, 'menus, dialogs'],
              ] as const
            ).map(([name, hex, use]) => (
              <Paper key={name} sx={{ bgcolor: hex, p: 2.5 }}>
                <Typography variant="subtitle2">{name}</Typography>
                <Typography variant="caption" sx={{ fontFamily: 'monospace', display: 'block' }}>
                  {hex.toUpperCase()}
                </Typography>
                <Typography variant="caption">{use}</Typography>
              </Paper>
            ))}
          </Grid>
        </Section>

        {/* ---------------------------------------------------------- */}
        <Section title="Tipografia" hint="Inter, escala em rem, tracking negativo nos títulos.">
          <Paper sx={{ p: 4 }}>
            <Typography variant="h1">H1 — Título de página</Typography>
            <Typography variant="h2">H2 — Seção</Typography>
            <Typography variant="h3">H3 — Subseção</Typography>
            <Typography variant="h4">H4 — Bloco</Typography>
            <Typography variant="h5">H5 — Card</Typography>
            <Typography variant="h6">H6 — Rótulo forte</Typography>
            <Divider sx={{ my: 2.5 }} />
            <Typography variant="body1" sx={{ mb: 1 }}>
              body1 — texto corrido de leitura. Um <Link href="#">link em verde-água</Link> dentro do parágrafo
              não compete com o botão amarelo da tela.
            </Typography>
            <Typography variant="body2" sx={{ mb: 1 }}>
              body2 — texto de apoio, já em cinza claro por padrão.
            </Typography>
            <Typography variant="caption" display="block">
              caption — legenda e metadado.
            </Typography>
            <Typography variant="overline">overline — rótulo de seção</Typography>
          </Paper>
        </Section>

        {/* ---------------------------------------------------------- */}
        <Section
          title="Botões"
          hint="Regra: no máximo um botão âmbar preenchido por tela. Texto sobre âmbar é sempre quase-preto; sobre petróleo, branco."
        >
          <Paper sx={{ p: 3 }}>
            <Stack spacing={2.5}>
              {(['contained', 'outlined', 'text'] as const).map((variant) => (
                <Stack key={variant} direction="row" spacing={1.5} alignItems="center" flexWrap="wrap" useFlexGap>
                  <Typography variant="caption" sx={{ width: 88, fontFamily: 'monospace' }}>
                    {variant}
                  </Typography>
                  <Button variant={variant}>Primary</Button>
                  <Button variant={variant} color="secondary">
                    Secondary
                  </Button>
                  <Button variant={variant} color="inherit">
                    Inherit
                  </Button>
                  <Button variant={variant} color="error">
                    Error
                  </Button>
                  <Button variant={variant} disabled>
                    Disabled
                  </Button>
                </Stack>
              ))}
              <Divider />
              <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap" useFlexGap>
                <Typography variant="caption" sx={{ width: 88, fontFamily: 'monospace' }}>
                  tamanhos
                </Typography>
                <Button size="small">Small</Button>
                <Button size="medium">Medium</Button>
                <Button size="large">Large</Button>
                <ToggleButtonGroup
                  size="small"
                  exclusive
                  value={align}
                  onChange={(_, v) => v && setAlign(v)}
                  sx={{ ml: 2 }}
                >
                  <ToggleButton value="dia">Dia</ToggleButton>
                  <ToggleButton value="semana">Semana</ToggleButton>
                  <ToggleButton value="mes">Mês</ToggleButton>
                </ToggleButtonGroup>
              </Stack>
            </Stack>
          </Paper>
        </Section>

        {/* ---------------------------------------------------------- */}
        <Section title="Formulários" hint="Foco do campo em âmbar; o anel de foco por teclado (Tab) é petróleo.">
          <Grid min={320}>
            <Paper sx={{ p: 3 }}>
              <Stack spacing={2.5}>
                <TextField label="Nome" placeholder="Digite seu nome" fullWidth />
                <TextField label="E-mail" defaultValue="victor@exemplo.com" fullWidth helperText="Já verificado." />
                <TextField label="Senha" type="password" defaultValue="12345" error helperText="Senha muito curta." fullWidth />
                <TextField label="Desabilitado" value="Somente leitura" disabled fullWidth />
                <TextField label="Observações" multiline rows={3} placeholder="Opcional" fullWidth />
              </Stack>
            </Paper>

            <Paper sx={{ p: 3 }}>
              <Stack spacing={1}>
                <Typography variant="subtitle2">Seleção</Typography>
                <FormControlLabel control={<Checkbox defaultChecked />} label="Receber notificações" />
                <FormControlLabel control={<Checkbox indeterminate />} label="Estado indeterminado" />
                <FormControlLabel control={<Checkbox disabled />} label="Desabilitado" />
                <Divider sx={{ my: 1.5 }} />
                <RadioGroup defaultValue="b">
                  <FormControlLabel value="a" control={<Radio />} label="Plano mensal" />
                  <FormControlLabel value="b" control={<Radio />} label="Plano anual" />
                </RadioGroup>
                <Divider sx={{ my: 1.5 }} />
                <FormControlLabel control={<Switch defaultChecked />} label="Modo automático" />
                <FormControlLabel control={<Switch />} label="Beta" />
                <Divider sx={{ my: 1.5 }} />
                <Typography variant="subtitle2" sx={{ mb: 1 }}>
                  Limite de uso
                </Typography>
                <Slider defaultValue={62} valueLabelDisplay="auto" />
              </Stack>
            </Paper>
          </Grid>
        </Section>

        {/* ---------------------------------------------------------- */}
        <Section title="Feedback" hint="Sucesso usa um verde de verdade (matiz 150) — petróleo seria ambíguo demais. O alerta virou laranja-avermelhado para não se confundir com o âmbar da marca.">
          <Stack spacing={2}>
            <Alert severity="success">Deploy concluído em 42s.</Alert>
            <Alert severity="info">Uma nova versão do tema está disponível.</Alert>
            <Alert severity="warning">O certificado expira em 7 dias.</Alert>
            <Alert severity="error">Falha ao conectar no banco de dados.</Alert>
          </Stack>

          <Grid min={280} sx={{ mt: 2 }}>
            <Paper sx={{ p: 3 }}>
              <Typography variant="subtitle2" sx={{ mb: 2 }}>
                Chips
              </Typography>
              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                <Chip label="Default" />
                <Chip label="Primary" color="primary" />
                <Chip label="Secondary" color="secondary" />
                <Chip label="Outlined" variant="outlined" />
                <Chip label="Removível" color="primary" onDelete={() => {}} />
              </Stack>
            </Paper>

            <Paper sx={{ p: 3 }}>
              <Typography variant="subtitle2" sx={{ mb: 2 }}>
                Progresso e carregamento
              </Typography>
              <LinearProgress value={68} variant="determinate" sx={{ mb: 1.5 }} />
              <LinearProgress color="secondary" sx={{ mb: 2.5 }} />
              <Skeleton width="70%" height={14} />
              <Skeleton width="90%" height={14} />
              <Skeleton width="45%" height={14} />
            </Paper>

            <Paper sx={{ p: 3 }}>
              <Typography variant="subtitle2" sx={{ mb: 2 }}>
                Avatares e badges
              </Typography>
              <Stack direction="row" spacing={2} alignItems="center">
                <Badge badgeContent={4} color="primary">
                  <Avatar>VA</Avatar>
                </Badge>
                <Avatar sx={{ bgcolor: 'fill.primary', color: 'fill.primaryText' }}>DS</Avatar>
                <Avatar sx={{ bgcolor: 'fill.secondary', color: 'fill.secondaryText' }}>UI</Avatar>
                <Tooltip title="Tooltip com seta">
                  <IconButton>
                    <Box component="span" sx={{ fontSize: 18 }}>
                      ?
                    </Box>
                  </IconButton>
                </Tooltip>
              </Stack>
            </Paper>
          </Grid>
        </Section>

        {/* ---------------------------------------------------------- */}
        <Section title="Navegação" hint="O indicador de aba e o item selecionado usam o âmbar em 12–14% de opacidade.">
          <Grid min={320}>
            <Paper sx={{ p: 0, overflow: 'hidden' }}>
              <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ px: 2 }}>
                <Tab label="Visão geral" />
                <Tab label="Atividade" />
                <Tab label="Configurações" />
              </Tabs>
              <Box sx={{ p: 3 }}>
                <Typography variant="body2">Conteúdo da aba {tab + 1}.</Typography>
              </Box>
            </Paper>

            <Paper sx={{ p: 1.5 }}>
              <List disablePadding>
                {['Dashboard', 'Projetos', 'Equipe', 'Faturamento'].map((item, i) => (
                  <ListItemButton key={item} selected={i === 1}>
                    <ListItemIcon>
                      <Box component="span" sx={{ fontSize: 16 }}>
                        ▸
                      </Box>
                    </ListItemIcon>
                    <ListItemText primary={item} />
                  </ListItemButton>
                ))}
              </List>
              <Divider sx={{ my: 1 }} />
              <Button fullWidth variant="text" color="inherit" onClick={(e) => setAnchor(e.currentTarget)}>
                Abrir menu
              </Button>
              <Menu anchorEl={anchor} open={!!anchor} onClose={() => setAnchor(null)}>
                <MenuItem onClick={() => setAnchor(null)}>Duplicar</MenuItem>
                <MenuItem selected onClick={() => setAnchor(null)}>
                  Renomear
                </MenuItem>
                <MenuItem onClick={() => setAnchor(null)}>Arquivar</MenuItem>
                <Divider />
                <MenuItem onClick={() => setAnchor(null)} sx={{ color: 'error.main' }}>
                  Excluir
                </MenuItem>
              </Menu>
            </Paper>
          </Grid>
        </Section>

        {/* ---------------------------------------------------------- */}
        <Section title="Cards" hint="Borda de 1px e glow âmbar só no hover do card em destaque.">
          <Grid min={280}>
            <Card>
              <CardHeader title="Card padrão" subheader="Superfície elevada" />
              <CardContent>
                <Typography variant="body2">
                  Conteúdo sobre <code>background.paper</code>, delimitado pela borda e não pela sombra.
                </Typography>
              </CardContent>
              <CardActions>
                <Button size="small" variant="text">
                  Ver
                </Button>
                <Button size="small" variant="text" color="inherit">
                  Depois
                </Button>
              </CardActions>
            </Card>

            <Card
              sx={{
                '&:hover': {
                  borderColor: 'primary.main',
                  boxShadow: theme.vars.palette.elevation.glowPrimary,
                  transform: 'translateY(-2px)',
                },
              }}
            >
              <CardHeader
                title="Card em destaque"
                subheader="Passe o mouse"
                action={<Chip label="Pro" size="small" color="primary" />}
              />
              <CardContent>
                <Typography variant="h3" sx={{ color: 'accent.primary' }}>
                  R$ 149
                </Typography>
                <Typography variant="body2">por mês, cobrado anualmente</Typography>
              </CardContent>
              <CardActions>
                <Button size="small" fullWidth>
                  Assinar
                </Button>
              </CardActions>
            </Card>

            <Card>
              <CardHeader title="Métrica" subheader="Últimos 30 dias" />
              <CardContent>
                <Typography variant="h3" sx={{ color: 'accent.secondary' }}>
                  +18,4%
                </Typography>
                <LinearProgress color="secondary" variant="determinate" value={78} sx={{ mt: 2 }} />
              </CardContent>
              <CardActions>
                <Button size="small" variant="text" color="secondary" onClick={() => setDialog(true)}>
                  Abrir dialog
                </Button>
              </CardActions>
            </Card>
          </Grid>
        </Section>

        {/* ---------------------------------------------------------- */}
        <Section title="Tabela" hint="Cabeçalho em superfície recuada, linhas com hover sutil.">
          <TableContainer component={Paper} sx={{ border: 'none' }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Projeto</TableCell>
                  <TableCell>Responsável</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell align="right">Progresso</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {[
                  ['Migração de API', 'Victor', 'Em andamento', 64, 'primary'],
                  ['Redesign do app', 'Equipe UI', 'Concluído', 100, 'secondary'],
                  ['Integração de pagamentos', 'Backend', 'Bloqueado', 22, 'error'],
                  ['Observabilidade', 'Infra', 'Em andamento', 48, 'primary'],
                ].map(([nome, dono, status, pct, cor]) => (
                  <TableRow key={nome as string}>
                    <TableCell>{nome as string}</TableCell>
                    <TableCell sx={{ color: 'text.secondary' }}>{dono as string}</TableCell>
                    <TableCell>
                      <Chip
                        label={status as string}
                        size="small"
                        color={cor as 'primary' | 'secondary' | 'error'}
                        variant={cor === 'error' ? 'outlined' : 'filled'}
                      />
                    </TableCell>
                    <TableCell align="right" sx={{ fontFamily: 'monospace' }}>
                      {pct as number}%
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Section>

        <Divider sx={{ my: 4 }} />
        <Typography variant="caption" display="block" sx={{ textAlign: 'center', pb: 4 }}>
          Pressione <Box component="kbd" sx={{ fontFamily: 'monospace', color: 'accent.secondary' }}>Tab</Box> para
          ver o anel de foco em petróleo — ele é o mesmo nos dois modos.
        </Typography>
      </Container>

      <Dialog open={dialog} onClose={() => setDialog(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Confirmar alteração</DialogTitle>
        <DialogContent>
          <DialogContentText>
            O dialog usa a superfície de overlay, raio maior e a única sombra que realmente aparece no preto.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button variant="text" color="inherit" onClick={() => setDialog(false)}>
            Cancelar
          </Button>
          <Button onClick={() => setDialog(false)}>Confirmar</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
