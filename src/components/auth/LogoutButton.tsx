"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

export function LogoutButton() {
  const router = useRouter();
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [error, setError] = useState("");

  async function signOut() {
    if (isSigningOut) return;

    setIsSigningOut(true);
    setError("");

    const supabase = getSupabaseBrowserClient();
    const [supabaseResult, navigationResponse] = await Promise.all([
      supabase.auth.signOut({ scope: "local" }),
      fetch("/api/auth/session", { method: "DELETE" }).catch(() => null),
    ]);
    const sessionAfterSignOut = supabaseResult.error
      ? (await supabase.auth.getSession()).data.session
      : null;

    if (sessionAfterSignOut || !navigationResponse?.ok) {
      setError("Não foi possível sair da conta. Tente novamente.");
      setIsSigningOut(false);
      return;
    }

    router.replace("/entrar");
    router.refresh();
  }

  return (
    <div className="app-logout">
      <button
        className="app-logout__button"
        type="button"
        onClick={signOut}
        disabled={isSigningOut}
        aria-describedby={error ? "logout-error" : undefined}
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none">
          <path d="M10 17l5-5-5-5M15 12H3M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4" />
        </svg>
        <span>{isSigningOut ? "Saindo…" : "Sair"}</span>
      </button>
      {error ? (
        <p className="app-logout__error" id="logout-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
