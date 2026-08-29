import { useState } from "react";

import { applyTheme, rememberTheme, type Theme } from "@/lib/theme";
import { saveTheme } from "@/lib/data/theme-actions";

/**
 * Alterna o tema da conta.
 *
 * `<button type="button">` com `onClick`, e não um `<form>` com submit: a
 * sidebar já tem um submit — o "Sair" —, e a suíte e2e conta com isso
 * (`button[type=submit]` também casa o Sair, em `CLAUDE.md`). Um segundo submit
 * aqui tornaria ambíguo todo seletor de formulário escopado na sidebar.
 *
 * A troca é OTIMISTA: aplica na tela e no aparelho, depois grava na conta. Se a
 * conta recusar, a escolha continua valendo aqui e a mensagem diz exatamente
 * isso — o modo de falha que não se aceita é o silencioso, em que a pessoa acha
 * que escolheu e no outro aparelho volta o claro sem explicação (R-TEMA-12).
 */
export function ThemeToggle({ profileId, initial }: { profileId: string; initial: Theme }) {
  const [theme, setTheme] = useState<Theme>(initial);
  const [unsaved, setUnsaved] = useState(false);

  async function toggle() {
    const next: Theme = theme === "dark" ? "light" : "dark";

    setTheme(next);
    applyTheme(next);
    rememberTheme(profileId, next);
    setUnsaved(false);

    if (await saveTheme(profileId, next)) setUnsaved(true);
  }

  return (
    <div className="sidebar__theme">
      <button type="button" className="btn btn--ghost btn--block btn--sm" onClick={toggle}>
        {theme === "dark" ? "Tema claro" : "Tema escuro"}
      </button>
      {unsaved && (
        <p className="sidebar__note" role="status">
          Tema aplicado neste aparelho. Não foi possível salvar na sua conta.
        </p>
      )}
    </div>
  );
}
