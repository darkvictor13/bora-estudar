import ButtonBase from '@mui/material/ButtonBase';

/** 1 = segunda, 7 = domingo. O mesmo número que a meta guarda. */
export type Weekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;

/**
 * Os dois nomes de cada dia, indexados por `weekday - 1`.
 *
 * Escritos à mão, e não tirados de `Intl.DateTimeFormat`: o formatador devolve
 * "seg.", com ponto e em caixa baixa, e depende do locale do navegador — que
 * numa máquina em inglês daria "Mon". O produto é em português, e a semana
 * começa na segunda; nenhuma das duas coisas é negociável por configuração de
 * quem está lendo.
 */
export const WEEKDAY_SHORT_NAMES = ['SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB', 'DOM'] as const;
export const WEEKDAY_NAMES = [
  'Segunda-feira',
  'Terça-feira',
  'Quarta-feira',
  'Quinta-feira',
  'Sexta-feira',
  'Sábado',
  'Domingo',
] as const;

export interface DayChipProps {
  readonly weekday: Weekday;
  readonly selected: boolean;
  readonly onToggle?: (weekday: Weekday) => void;
  readonly disabled?: boolean;
}

/**
 * O `.ciclo-dia` da v2: o seletor de dia da semana, em pastilha.
 *
 * É um `<button>` com `aria-pressed`, e não uma caixa de seleção disfarçada.
 * A v2 escondia um `<input type=checkbox>` dentro do rótulo e pintava o estado
 * com `:has(input:checked)`; funciona no olho e some no leitor de tela, que
 * anuncia "caixa de seleção SEG" sem dizer o que marcar um dia faz. O nome
 * completo vai no `aria-label` justamente porque "SEG" sozinho não é palavra.
 */
export function DayChip({ weekday, selected, onToggle, disabled = false }: DayChipProps) {
  return (
    <ButtonBase
      data-testid="day-chip"
      data-weekday={weekday}
      data-selected={selected}
      aria-pressed={selected}
      aria-label={WEEKDAY_NAMES[weekday - 1]}
      disabled={disabled}
      {...(onToggle ? { onClick: () => onToggle(weekday) } : {})}
      sx={(theme) => ({
        minWidth: 34,
        height: 26,
        px: 1,
        borderRadius: `${theme.brand.radius.pill}px`,
        border: '1px solid',
        ...theme.typography.numeric,
        fontSize: '0.625rem',
        transition: theme.transitions.create(['background-color', 'border-color', 'color']),
        backgroundColor: selected
          ? theme.vars.palette.fill.secondary
          : theme.vars.palette.surface.raised,
        borderColor: selected
          ? theme.vars.palette.fill.secondary
          : theme.vars.palette.surface.controlBorder,
        color: selected
          ? theme.vars.palette.fill.secondaryText
          : theme.vars.palette.text.secondary,
        '&:hover': {
          // O preenchimento ESCURECE no hover porque o texto sobre ele é
          // branco: clarear derrubaria o contraste em vez de aumentá-lo.
          backgroundColor: selected
            ? theme.vars.palette.fill.secondaryHover
            : theme.vars.palette.surface.hover,
        },
        '&.Mui-disabled': { opacity: 0.5 },
      })}
    >
      {WEEKDAY_SHORT_NAMES[weekday - 1]}
    </ButtonBase>
  );
}
