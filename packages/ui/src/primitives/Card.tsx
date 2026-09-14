import MuiCard from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import CardHeader from '@mui/material/CardHeader';
import type { SxProps, Theme } from '@mui/material/styles';
import type { ReactNode } from 'react';

/**
 * O `.card` da v2 — a caixa que toda tela repete.
 *
 * O título sai como `<h2>` de verdade, e não como o `<span>` que o
 * `CardHeader` produz por padrão: a suíte encontra cartão pelo cabeçalho
 * (`getByRole('heading', { name })`), e um `<span>` não tem papel de
 * cabeçalho. Fora do teste, é o que dá à tela um sumário navegável por
 * leitor de tela em vez de uma sequência de caixas anônimas.
 */
export interface CardProps {
  readonly title?: string;
  readonly sub?: string;
  /** Botão ou seletor no canto do cabeçalho. */
  readonly action?: ReactNode;
  readonly children: ReactNode;
  readonly sx?: SxProps<Theme>;
}

export function Card({ title, sub, action, children, sx }: CardProps) {
  const hasHeader = Boolean(title || sub || action);

  return (
    <MuiCard data-testid="card" {...(sx ? { sx } : {})}>
      {hasHeader && (
        <CardHeader
          {...(title ? { title } : {})}
          {...(sub ? { subheader: sub } : {})}
          {...(action ? { action } : {})}
          slotProps={{
            title: { variant: 'h2', component: 'h2' },
            subheader: { variant: 'caption', component: 'p' },
            // O padrão do MUI é `margin-top: -8px` mais alinhamento ao topo,
            // pensado para um `IconButton`. Aqui a ação costuma ser um botão
            // de texto, que fica torto assim.
            action: { style: { alignSelf: 'center', margin: 0 } },
          }}
        />
      )}
      <CardContent sx={hasHeader ? { pt: 1.5 } : undefined}>{children}</CardContent>
    </MuiCard>
  );
}
