import Box from "@mui/material/Box";

/** Decorative light ribbons; CSS animation avoids a continuous canvas render loop. */
export function AuthBackdrop({ paused }: { paused: boolean }) {
  return (
    <Box
      aria-hidden="true"
      data-testid="auth-backdrop"
      sx={(theme) => ({
        position: "fixed",
        inset: 0,
        overflow: "hidden",
        pointerEvents: "none",
        // No claro as fitas são mais discretas: o texto do cartão de vidro as atravessa.
        opacity: 0.4,
        ...theme.applyStyles("dark", { opacity: 0.65 }),
        maskImage: "linear-gradient(to bottom, transparent, black 15%, black 80%, transparent)",
        "@keyframes authRibbon": {
          "0%, 100%": { transform: "translate3d(0, -12%, 0) scaleY(0.85)", opacity: 0.2 },
          "50%": { transform: "translate3d(18px, 12%, 0) scaleY(1.15)", opacity: 0.7 },
        },
        "& > span": {
          position: "absolute",
          top: "-30%",
          height: "160%",
          borderRadius: "50%",
          background: `linear-gradient(180deg, transparent 5%, ${theme.vars.palette.accent.primarySoft} 30%, ${theme.vars.palette.accent.primary} 52%, ${theme.vars.palette.accent.secondarySoft} 70%, transparent 95%)`,
          animation: "authRibbon 14s ease-in-out infinite",
          animationPlayState: paused ? "paused" : "running",
          "@media (prefers-reduced-motion: reduce)": { animation: "none", opacity: 0.25 },
        },
      })}
    >
      {Array.from({ length: 24 }, (_, index) => (
        <Box
          component="span"
          key={index}
          sx={{
            left: `${8 + index * 3.6}%`,
            width: index % 3 === 0 ? 7 : 2,
            filter: index % 3 === 0 ? "blur(6px)" : "blur(1px)",
            animationDelay: `${-index * 1.7}s !important`,
            animationDuration: `${12 + (index % 5) * 2}s !important`,
          }}
        />
      ))}
    </Box>
  );
}
