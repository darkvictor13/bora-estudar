/**
 * Namespace unificado das APIs de extensão.
 *
 * O Firefox expõe `browser.*` com promises e `chrome.*` apenas com callback.
 * O Chrome MV3 expõe `chrome.*` com promises e não tem `browser`.
 *
 * Usar `chrome.*` direto faria `await storage.get(k)` devolver `undefined` no
 * Firefox — a extensão instalaria sem erro e simplesmente nunca restauraria a
 * sessão. Preferir `browser` quando existir resolve isso e mantém um único
 * código-fonte para os dois navegadores.
 */
const runtime = (globalThis as { browser?: typeof chrome }).browser ?? globalThis.chrome;

export const ext = runtime;
export const storage = runtime.storage.local;
export const tabs = runtime.tabs;
