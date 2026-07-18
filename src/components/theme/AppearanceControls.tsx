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

  return (
    <div className={styles.controls} aria-label="Aparência da interface">
      <div className={styles.group} role="group" aria-label="Tema">
        <span className={styles.label}>Tema</span>
        <button
          className={styles.option}
          type="button"
          aria-pressed={theme === "light"}
          onClick={() => updateAppearance("light", profile)}
        >
          Claro
        </button>
        <button
          className={styles.option}
          type="button"
          aria-pressed={theme === "dark"}
          onClick={() => updateAppearance("dark", profile)}
        >
          Escuro
        </button>
      </div>

      <div className={styles.group} role="group" aria-label="Perfil visual">
        <span className={styles.label}>Perfil</span>
        <button
          className={styles.option}
          type="button"
          aria-pressed={profile === "aluno"}
          onClick={() => updateAppearance(theme, "aluno")}
        >
          Aluno
        </button>
        <button
          className={styles.option}
          type="button"
          aria-pressed={profile === "professor"}
          onClick={() => updateAppearance(theme, "professor")}
        >
          Professor
        </button>
      </div>
    </div>
  );
}
