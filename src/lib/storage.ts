import type { Session } from "./types";

const STORAGE_KEY = "sorting-hat:sessions";

function readAll(): Record<string, Session> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Record<string, Session>;
  } catch {
    return {};
  }
}

function writeAll(sessions: Record<string, Session>): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
}

export function listSessions(): Session[] {
  return Object.values(readAll()).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function getSession(id: string): Session | null {
  return readAll()[id] ?? null;
}

export function saveSession(session: Session): void {
  const all = readAll();
  all[session.id] = session;
  writeAll(all);
}

export function deleteSession(id: string): void {
  const all = readAll();
  delete all[id];
  writeAll(all);
}
