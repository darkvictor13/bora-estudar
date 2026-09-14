import FormControl from '@mui/material/FormControl';
import FormHelperText from '@mui/material/FormHelperText';
import FormLabel from '@mui/material/FormLabel';
import IconButton from '@mui/material/IconButton';
import OutlinedInput from '@mui/material/OutlinedInput';
import VisibilityIcon from '@mui/icons-material/VisibilityOutlined';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOffOutlined';
import { useState, type InputHTMLAttributes } from 'react';

type NativeInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'id' | 'name' | 'type'>;

export interface FieldProps extends NativeInputProps {
  readonly label: string;
  readonly name: string;
  readonly type?: string;
  readonly hint?: string;
  readonly error?: string;
  /**
   * Marca o campo como recusado SEM escrever nada embaixo dele.
   *
   * É o caso do formulário cujo erro já está dito uma vez, no aviso do topo:
   * repetir a mesma frase a dois centímetros de distância não informa nada e
   * faz o leitor de tela anunciar duas vezes. O vermelho aqui responde "qual
   * dos três campos?", que é a única pergunta que o aviso lá em cima não
   * responde.
   */
  readonly invalid?: boolean;
}

/**
 * Rótulo ACIMA do campo, como na v2 — não o rótulo flutuante do MUI.
 *
 * O flutuante do Material ocupa o interior do campo até alguém digitar; num
 * formulário de cinco linhas isso significa cinco rótulos que mudam de lugar
 * enquanto a pessoa preenche. A v2 os deixa parados em cima, e é o que mantém
 * a densidade dela: rótulo de 12px, campo de 13px, nada se mexendo.
 *
 * O `id` é `field-<name>`, e é contrato: a suíte e2e digita por `#field-email`
 * e `#field-password`.
 */
export function Field({ label, name, type = 'text', hint, error, invalid, ...rest }: FieldProps) {
  const id = `field-${name}`;
  const isPassword = type === 'password';

  /**
   * Começa SEMPRE oculta, a cada montagem (R-UI-14).
   *
   * Nada de lembrar "estava visível": quem abre a tela depois pode ser outra
   * pessoa, no mesmo computador.
   */
  const [revealed, setRevealed] = useState(false);

  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;

  return (
    <FormControl fullWidth error={Boolean(error) || Boolean(invalid)} sx={{ mb: 1.75 }}>
      <FormLabel
        htmlFor={id}
        sx={(theme) => ({
          mb: 0.625,
          fontSize: '0.75rem',
          fontWeight: 600,
          color: theme.vars.palette.text.secondary,
          '&.Mui-focused, &.Mui-error': { color: theme.vars.palette.text.secondary },
        })}
      >
        {label}
      </FormLabel>

      <OutlinedInput
        id={id}
        name={name}
        size="small"
        // ALTERNA O `type` DO PRÓPRIO INPUT, e nada mais: a senha nunca existe
        // em dois lugares, e o `autoComplete` que o campo já tinha continua
        // valendo — o gerenciador de senhas não pode perder o campo só porque
        // o texto ficou visível (R-UI-09, R-UI-12).
        type={isPassword && revealed ? 'text' : type}
        {...(describedBy ? { 'aria-describedby': describedBy } : {})}
        inputProps={rest}
        {...(isPassword
          ? {
              endAdornment: (
                // `type="button"` não é detalhe: um <button> sem tipo dentro
                // de <form> SUBMETE, e aqui submeteria o login ao tentar ver
                // a senha.
                <IconButton
                  type="button"
                  edge="end"
                  size="small"
                  aria-label={revealed ? 'Ocultar senha' : 'Mostrar senha'}
                  aria-pressed={revealed}
                  onClick={() => setRevealed((current) => !current)}
                >
                  {revealed ? (
                    <VisibilityOffIcon fontSize="small" />
                  ) : (
                    <VisibilityIcon fontSize="small" />
                  )}
                </IconButton>
              ),
            }
          : {})}
      />

      {error && <FormHelperText id={`${id}-error`}>{error}</FormHelperText>}
      {!error && hint && <FormHelperText id={`${id}-hint`}>{hint}</FormHelperText>}
    </FormControl>
  );
}
