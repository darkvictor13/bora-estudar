import "server-only";

import { cache } from "react";
import { cookies } from "next/headers";

export const SESSION_COOKIE = "be-session";

export type UserRole = "aluno" | "professor" | "admin";
export type AcademicAccess =
  | "pendente"
  | "ativo"
  | "bloqueado"
  | "expirado"
  | "cancelado";

export type NavigationSession = {
  subject: string;
  role: UserRole;
  expiresAt: number;
  academicAccess?: AcademicAccess;
  linkedStudentIds?: string[];
};

const textEncoder = new TextEncoder();

function decodeBase64Url(value: string) {
  try {
    return Uint8Array.from(atob(value.replace(/-/g, "+").replace(/_/g, "/")), (char) =>
      char.charCodeAt(0),
    );
  } catch {
    return null;
  }
}

function decodeText(value: string) {
  const bytes = decodeBase64Url(value);
  return bytes ? new TextDecoder().decode(bytes) : null;
}

function encodeBase64Url(value: Uint8Array | string) {
  const bytes = typeof value === "string" ? textEncoder.encode(value) : value;
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function isNavigationSession(value: unknown): value is NavigationSession {
  if (!value || typeof value !== "object") return false;
  const session = value as Partial<NavigationSession>;

  return (
    typeof session.subject === "string" &&
    ["aluno", "professor", "admin"].includes(session.role ?? "") &&
    typeof session.expiresAt === "number" &&
    session.expiresAt > Date.now()
  );
}

export async function verifyNavigationSession(
  cookieValue: string | undefined,
  secret = process.env.SESSION_SECRET,
): Promise<NavigationSession | null> {
  if (!cookieValue || !secret || secret.length < 32) return null;

  const [encodedPayload, encodedSignature, ...extra] = cookieValue.split(".");
  if (!encodedPayload || !encodedSignature || extra.length) return null;

  const signature = decodeBase64Url(encodedSignature);
  if (!signature) return null;

  const key = await crypto.subtle.importKey(
    "raw",
    textEncoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );
  const validSignature = await crypto.subtle.verify(
    "HMAC",
    key,
    signature,
    textEncoder.encode(encodedPayload),
  );
  if (!validSignature) return null;

  const payload = decodeText(encodedPayload);
  if (!payload) return null;

  try {
    const session: unknown = JSON.parse(payload);
    return isNavigationSession(session) ? session : null;
  } catch {
    return null;
  }
}

export async function signNavigationSession(
  session: NavigationSession,
  secret = process.env.SESSION_SECRET,
) {
  if (!secret || secret.length < 32) {
    throw new Error("SESSION_SECRET precisa ter pelo menos 32 caracteres.");
  }

  const encodedPayload = encodeBase64Url(JSON.stringify(session));
  const key = await crypto.subtle.importKey(
    "raw",
    textEncoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    textEncoder.encode(encodedPayload),
  );

  return `${encodedPayload}.${encodeBase64Url(new Uint8Array(signature))}`;
}

export const getNavigationSession = cache(async () => {
  const cookieStore = await cookies();
  return verifyNavigationSession(cookieStore.get(SESSION_COOKIE)?.value);
});

export function homeForRole(role: UserRole) {
  const homes: Record<UserRole, string> = {
    aluno: "/aluno/inicio",
    professor: "/professor/alunos",
    admin: "/admin/inicio",
  };
  return homes[role];
}

export function isAcademicAccessActive(session: NavigationSession) {
  return session.role === "aluno" && session.academicAccess === "ativo";
}

export function hasActiveStudentLink(session: NavigationSession, studentId: string) {
  return (
    session.role === "professor" &&
    Boolean(session.linkedStudentIds?.includes(studentId))
  );
}
