/**
 * As primitivas que a v2 repete em toda tela.
 *
 * Moram em `@bora/ui`, e não em `apps/web/components`, por dois motivos: o
 * playground do pacote deixa revisar cada uma sem subir o app inteiro, e a
 * área do professor usa as mesmas caixas que a do aluno — `Card`, `Badge` e
 * `Metric` não pertencem a nenhuma das duas.
 *
 * Toda primitiva carrega o próprio `data-testid`. É ele que permite reescrever
 * o interior sem reescrever a suíte: a classe do Emotion muda quando o Emotion
 * decide, e a classe da v2 some junto com o CSS dela.
 */
export { Alert, type AlertProps, type AlertStatus } from './Alert.tsx';
export { Badge, type BadgeProps, type BadgeTone } from './Badge.tsx';
export { Card, type CardProps } from './Card.tsx';
export {
  DayChip,
  WEEKDAY_NAMES,
  WEEKDAY_SHORT_NAMES,
  type DayChipProps,
  type Weekday,
} from './DayChip.tsx';
export { Empty, type EmptyProps } from './Empty.tsx';
export { Field, type FieldProps } from './Field.tsx';
export { Metric, type MetricProps } from './Metric.tsx';
export { PageHeader, type PageHeaderProps } from './PageHeader.tsx';
