"use client";

import { useSyncExternalStore } from "react";

import styles from "./AppearanceControls.module.css";

type Theme = "light" | "dark";
type Profile = "aluno" | "professor";

const APPEARANCE_EVENT = "be-appearance-change";

function subscribe(onStoreChange: () => void) {
  window.addEventListener(APPEARANCE_EVENT, onStoreChange);
  window.addEventListener("storage", onStoreChange);

  return () => {
    window.removeEventListener(APPEARANCE_EVENT, onStoreChange);
    window.removeEventListener("storage", onStoreChange);
  };
}

function getSnapshot() {
  const root = document.documentElement;
  const theme: Theme = root.dataset.theme === "dark" ? "dark" : "light";
  const profile: Profile =
    root.dataset.profile === "professor" ? "professor" : "aluno";

  return `${theme}:${profile}`;
}

function getServerSnapshot() {
  return "light:aluno";
}

function updateAppearance(theme: Theme, profile: Profile) {
  const root = document.documentElement;

  if (theme === "dark") root.dataset.theme = "dark";
  else delete root.dataset.theme;

  root.dataset.profile = profile;
  localStorage.setItem("be-theme", theme);
  localStorage.setItem("be-profile", profile);
  window.dispatchEvent(new Event(APPEARANCE_EVENT));
}

export function AppearanceControls() {
  const snapshot = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );
  const [theme, profile] = snapshot.split(":") as [Theme, Profile];
  const isDark = theme === "dark";

  return (
    <div className={styles.controls} aria-label="Aparência da interface">
      <button
        className={styles.switch}
        type="button"
        role="switch"
        aria-checked={isDark}
        aria-label="Tema escuro"
        title={isDark ? "Ativar tema claro" : "Ativar tema escuro"}
        data-current-theme={theme}
        onClick={() => updateAppearance(isDark ? "light" : "dark", profile)}
      >
        <span className={`${styles.icon} ${styles.sun}`} aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="3.5" />
            <path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.42-1.42M17.66 6.34l1.41-1.41" />
          </svg>
        </span>
        <span className={`${styles.icon} ${styles.moon}`} aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none">
            <path d="M20.2 15.5A8.5 8.5 0 0 1 8.5 3.8 8.5 8.5 0 1 0 20.2 15.5Z" />
          </svg>
        </span>
        <span className={styles.thumb} aria-hidden="true" />
      </button>
    </div>
  );
}
