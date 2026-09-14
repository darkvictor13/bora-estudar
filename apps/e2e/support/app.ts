/**
 * Onde a aplicação está, num único lugar.
 *
 * É a `baseURL` do Playwright, e é o que qualquer teste usa para montar URL
 * absoluta: fixar "localhost:3000" no teste o faria falhar no dia em que a
 * suíte rodasse noutra porta, por um motivo que não tem nada a ver com o
 * produto.
 */
export const BASE_URL = process.env["E2E_BASE_URL"] ?? "http://localhost:3000";
