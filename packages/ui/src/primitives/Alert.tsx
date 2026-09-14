import MuiAlert from '@mui/material/Alert';
import type { ReactNode } from 'react';

/**
 * Os quatro papéis de aviso, nos nomes que a suíte e2e casa.
 *
 * `status` é ATRIBUTO no mesmo elemento, e não uma classe modificadora nem um
 * descendente: era `.alert--success` em 52 lugares da suíte, e o testid
 * nomeia o papel enquanto o `data-status` diz a variação. Um testid por
 * componente, não um por combinação.
 */
export type AlertStatus = 'success' | 'error' | 'info' | 'warning';

export interface AlertProps {
  readonly status?: AlertStatus;
  readonly children: ReactNode;
}

export function Alert({ status = 'info', children }: AlertProps) {
  return (
    <MuiAlert
      severity={status}
      // `alert` interrompe o leitor de tela; `status` espera a pausa. Erro
      // interrompe porque a pessoa acabou de agir e o que ela tentou não
      // aconteceu; sucesso e informação podem esperar.
      role={status === 'error' ? 'alert' : 'status'}
      // A v2 não põe ícone em `.alert`, e a caixa é curta demais para ganhar
      // um: o ícone empurraria o texto para uma segunda linha.
      icon={false}
      data-testid="alert"
      data-status={status}
      sx={{ mb: 1.75, fontSize: '0.8125rem', fontWeight: 500 }}
    >
      {children}
    </MuiAlert>
  );
}
