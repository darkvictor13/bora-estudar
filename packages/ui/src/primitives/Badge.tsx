import Box from '@mui/material/Box';
import type { ReactNode } from 'react';

/**
 * O `.badge` da v2 — a etiqueta curta que diz o estado de uma linha.
 *
 * EM MONO, e isso não é enfeite: badge vive em coluna de tabela, e no mono
 * todo algarismo ocupa a mesma largura, então `9%` e `100%` empilhados não
 * dançam. Peso 500 é o teto — DM Mono não publica negrito, e pedir 700 faz o
 * navegador sintetizar um falso-negrito que engorda o traço de forma
 * irregular, justamente no que precisa ser lido com precisão.
 *
 * Os tons são PAPÉIS, não cores: `success` continua verde se um dia o verde
 * mudar de hex. A v2 os chamava de `.blue`, `.green`, `.amber`, `.red` e
 * `.gray`, e quem lia a marcação não sabia o que um azul queria dizer.
 */
export type BadgeTone = 'neutral' | 'accent' | 'success' | 'warning' | 'error' | 'info';

export interface BadgeProps {
  readonly tone?: BadgeTone;
  readonly children: ReactNode;
}

export function Badge({ tone = 'neutral', children }: BadgeProps) {
  return (
    <Box
      component="span"
      data-testid="badge"
      data-tone={tone}
      sx={(theme) => {
        const paint =
          tone === 'neutral'
            ? {
                backgroundColor: theme.vars.palette.surface.sunken,
                color: theme.vars.palette.text.secondary,
                borderColor: theme.vars.palette.surface.border,
              }
            : tone === 'accent'
              ? {
                  backgroundColor: theme.vars.palette.accent.primarySoft,
                  color: theme.vars.palette.accent.primary,
                  borderColor: theme.vars.palette.accent.primaryBorder,
                }
              : {
                  backgroundColor: theme.vars.palette[tone].soft,
                  color: theme.vars.palette[tone].main,
                  borderColor: theme.vars.palette[tone].border,
                };

        return {
          display: 'inline-flex',
          alignItems: 'center',
          px: 1.125,
          py: 0.25,
          borderRadius: `${theme.brand.radius.sm}px`,
          border: '1px solid',
          ...theme.typography.numeric,
          fontSize: '0.6875rem',
          whiteSpace: 'nowrap',
          ...paint,
        };
      }}
    >
      {children}
    </Box>
  );
}
