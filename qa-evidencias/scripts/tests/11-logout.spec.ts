import { expect, go, test } from "../qa.ts";
const KEY = "sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH";
function sessionFromCookies(cookies: { name: string; value: string }[]) {
  const parts = cookies.filter((c) => c.name.startsWith("sb-") && c.name.includes("auth-token")).sort((a, b) => a.name.localeCompare(b.name));
  let raw = parts.map((c) => c.value).join("");
  if (raw.startsWith("base64-")) raw = Buffer.from(raw.slice(7), "base64").toString("utf8");
  return JSON.parse(raw) as { access_token: string; refresh_token: string };
}
test("F1.13 depois do Sair, o refresh token anterior ainda vale?", async ({ page, scenario, finding, monitor }) => {
  await page.goto("/entrar");
  await page.locator("#field-email").fill(scenario.student.email);
  await page.locator("#field-password").fill(scenario.student.password);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(page).toHaveURL(/\/aluno$/);
  await go(page, "/aluno/conta");
  const before = sessionFromCookies(await page.context().cookies());
  const logoutStatus: string[] = [];
  page.on("response", (r) => { if (r.url().includes("/auth/v1/logout")) logoutStatus.push(String(r.status())); });
  await page.locator('[data-testid="sign-out"]').click();
  await expect(page).toHaveURL(/\/entrar$/);
  await page.waitForTimeout(1500);
  const aborted = monitor.some((e) => e.kind === "requestfailed" && e.text.includes("/logout"));
  const res = await fetch("http://127.0.0.1:54321/auth/v1/token?grant_type=refresh_token", { method: "POST", headers: { apikey: KEY, "Content-Type": "application/json" }, body: JSON.stringify({ refresh_token: before.refresh_token }) });
  const user = await fetch("http://127.0.0.1:54321/auth/v1/user", { headers: { apikey: KEY, Authorization: `Bearer ${before.access_token}` } });
  console.log("LOGOUT aborted:", aborted, "responses:", logoutStatus.join(","), "| refresh depois do Sair:", res.status, "| access depois do Sair:", user.status);
  if (res.ok) finding({ severity: "Alto", title: "Sair não revoga a sessão no servidor: o refresh token anterior continua emitindo tokens", detail: `POST /logout abortado=${aborted}; refresh_token pós-logout respondeu ${res.status}` });
});
