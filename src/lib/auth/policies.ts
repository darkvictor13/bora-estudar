import type { AcademicAccess, UserRole } from "./session";

const publicPaths = new Set([
  "/entrar",
  "/cadastro",
  "/recuperar-senha",
  "/redefinir-senha",
  "/acesso-negado",
  "/pagina-nao-encontrada",
]);

const studentAccessExceptions = [
  "/aluno/acesso",
  "/aluno/perfil",
  "/aluno/lista-de-espera",
];

export function roleForPath(pathname: string): UserRole | null {
  if (pathname === "/aluno" || pathname.startsWith("/aluno/")) return "aluno";
  if (pathname === "/professor" || pathname.startsWith("/professor/")) return "professor";
  if (pathname === "/admin" || pathname.startsWith("/admin/")) return "admin";
  return null;
}

export function isPublicPath(pathname: string) {
  return pathname === "/" || publicPaths.has(pathname);
}

export function canStudentAccessPath(pathname: string, access?: AcademicAccess) {
  return (
    access === "ativo" ||
    studentAccessExceptions.some(
      (exception) => pathname === exception || pathname.startsWith(`${exception}/`),
    )
  );
}

export function safeReturnPath(pathname: string, search: string) {
  if (!pathname.startsWith("/") || pathname.startsWith("//")) return "/";
  return `${pathname}${search}`;
}

export function professorStudentIdForPath(pathname: string) {
  const match = pathname.match(/^\/professor\/alunos\/([^/]+)\//);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}
