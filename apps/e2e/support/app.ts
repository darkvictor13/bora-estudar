/**
 * Onde a aplicação está, num único lugar.
 *
 * Não é só a `baseURL` do Playwright: `StartQuizButton` monta o `returnUrl` a
 * partir de `location.origin`, então a origem aparece DENTRO do payload que a
 * extensão devolve. Um teste que verificasse `returnUrl` contra "localhost:3000"
 * fixo passaria a falhar no dia em que a suíte rodasse noutra porta, e o motivo
 * não teria nada a ver com o produto.
 */
export const BASE_URL = process.env["E2E_BASE_URL"] ?? "http://localhost:3000";

/** `returnUrl` que o site envia à extensão quando a bateria abre em `/aluno`. */
export const STUDENT_RETURN_URL = `${BASE_URL}/aluno`;
