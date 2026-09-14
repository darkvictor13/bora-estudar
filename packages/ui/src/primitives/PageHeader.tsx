import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import type { ReactNode } from 'react';

/**
 * O `.page-header` da v2: título, subtítulo e a fileira de ações.
 *
 * Fica GRUDADO no topo (`position: sticky`) como na v2. A rolagem é do
 * `<main>`, não do documento, então o cabeçalho permanece enquanto a lista de
 * metas corre por baixo — é o que dá à tela do aluno um ponto fixo enquanto
 * ele percorre a semana.
 */
export interface PageHeaderProps {
  readonly title: string;
  readonly description?: string;
  /** Botões e seletores. Ganham uma linha própria abaixo do título, como na v2. */
  readonly actions?: ReactNode;
}

export function PageHeader({ title, description, actions }: PageHeaderProps) {
  return (
    <Box
      component="header"
      data-testid="page-header"
      sx={(theme) => ({
        position: 'sticky',
        top: 0,
        zIndex: 10,
        px: 4,
        pt: 3,
        pb: 2.25,
        backgroundColor: theme.vars.palette.surface.raised,
        borderBottom: `1px solid ${theme.vars.palette.surface.border}`,
        [theme.breakpoints.down('md')]: { px: 2, pt: 2, pb: 2 },
      })}
    >
      <Typography variant="h1" component="h1">
        {title}
      </Typography>
      {description && (
        <Typography variant="body2" sx={{ mt: 0.25 }}>
          {description}
        </Typography>
      )}
      {actions && (
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mt: 1.75 }}>{actions}</Box>
      )}
    </Box>
  );
}
