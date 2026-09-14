import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import type { ReactNode } from 'react';

/**
 * O `.empty` da v2: o que uma lista mostra quando não tem nada.
 *
 * O ícone é decorativo e sai do alcance do leitor de tela — quem não enxerga
 * precisa da frase, e "📋" lido em voz alta não é informação.
 */
export interface EmptyProps {
  /** Um emoji. Opcional: nem toda lista vazia merece ilustração. */
  readonly icon?: string;
  readonly children: ReactNode;
}

export function Empty({ icon, children }: EmptyProps) {
  return (
    <Box data-testid="empty" sx={{ textAlign: 'center', px: 2.5, py: 5.5 }}>
      {icon && (
        <Box aria-hidden="true" sx={{ fontSize: 30, mb: 1.25, opacity: 0.35, lineHeight: 1 }}>
          {icon}
        </Box>
      )}
      <Typography variant="body2">{children}</Typography>
    </Box>
  );
}
