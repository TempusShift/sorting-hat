import { beforeEach, describe, expect, it } from "vitest";
import { deleteSession, getSession, listSessions, saveSession } from "./storage";
import type { Session } from "./types";

function makeSession(id: string, updatedAt: string): Session {
  return {
    id,
    name: `Session ${id}`,
    createdAt: updatedAt,
    updatedAt,
    people: [],
    groups: [],
    result: null,
  };
}

beforeEach(() => {
  window.localStorage.clear();
});

describe("storage", () => {
  it("returns an empty list when nothing is saved", () => {
    expect(listSessions()).toEqual([]);
  });

  it("saves and retrieves a session by id", () => {
    const session = makeSession("a", "2026-01-01T00:00:00.000Z");
    saveSession(session);
    expect(getSession("a")).toEqual(session);
  });

  it("returns null for an unknown id", () => {
    expect(getSession("missing")).toBeNull();
  });

  it("lists sessions sorted by updatedAt descending", () => {
    saveSession(makeSession("older", "2026-01-01T00:00:00.000Z"));
    saveSession(makeSession("newer", "2026-02-01T00:00:00.000Z"));
    expect(listSessions().map((s) => s.id)).toEqual(["newer", "older"]);
  });

  it("deletes a session", () => {
    saveSession(makeSession("a", "2026-01-01T00:00:00.000Z"));
    deleteSession("a");
    expect(getSession("a")).toBeNull();
    expect(listSessions()).toEqual([]);
  });

  it("overwrites an existing session with the same id", () => {
    saveSession(makeSession("a", "2026-01-01T00:00:00.000Z"));
    const updated = { ...makeSession("a", "2026-03-01T00:00:00.000Z"), name: "Renamed" };
    saveSession(updated);
    expect(getSession("a")?.name).toBe("Renamed");
    expect(listSessions()).toHaveLength(1);
  });
});
