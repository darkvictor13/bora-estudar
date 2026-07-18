type BrandMarkProps = {
  className?: string;
  label?: string;
};

/** Marca circular "BE" reproduzida sem depender de imagem externa. */
export function BrandMark({
  className = "",
  label = "Bora Estudar",
}: BrandMarkProps) {
  return (
    <span
      aria-label={label}
      className={`be-brand-mark ${className}`.trim()}
      role="img"
    >
      BE
    </span>
  );
}
