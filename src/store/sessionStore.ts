import { create } from "zustand";
import { v4 as uuidv4 } from "uuid";
import {
  DEFAULT_OPTIMAL_PRIORITY,
  runGaleShapley,
  runOptimalAssignment,
  type MatchingMethod,
  type OptimalPriority,
} from "@/lib/algorithm";
import * as matchCache from "@/lib/matchCache";
import * as storage from "@/lib/storage";
import type { Group, Person, Session } from "@/lib/types";

interface SessionStore {
  sessions: Session[];
  hydrated: boolean;
  isMatching: boolean;
  /** Marks matching as pending/settled without running it — for showing the loading state during a debounce window before `runMatching` itself fires. */
  setMatchingPending: (pending: boolean) => void;
  hydrate: () => void;
  createSession: (name: string) => Session;
  getSession: (id: string) => Session | undefined;
  renameSession: (id: string, name: string) => void;
  setPeopleAndGroups: (id: string, people: Person[], groups: Group[]) => void;
  setFillUnmatched: (id: string, fillUnmatched: boolean) => void;
  setMatchingMethod: (id: string, matchingMethod: MatchingMethod) => void;
  setOptimalPriority: (id: string, optimalPriority: OptimalPriority) => void;
  setMutualOnly: (id: string, mutualOnly: boolean) => void;
  setFillGroups: (id: string, fillGroups: boolean) => void;
  runMatching: (id: string) => Promise<void>;
  deleteSession: (id: string) => void;
}

function touch(session: Session): Session {
  return { ...session, updatedAt: new Date().toISOString() };
}

export const useSessionStore = create<SessionStore>((set, get) => ({
  sessions: [],
  hydrated: false,
  isMatching: false,

  setMatchingPending: (pending) => set({ isMatching: pending }),

  hydrate: () => {
    if (get().hydrated) return;
    set({ sessions: storage.listSessions(), hydrated: true });
  },

  createSession: (name: string) => {
    const now = new Date().toISOString();
    const session: Session = {
      id: uuidv4(),
      name,
      createdAt: now,
      updatedAt: now,
      people: [],
      groups: [],
      result: null,
      fillUnmatched: false,
      matchingMethod: "stable",
      optimalPriority: DEFAULT_OPTIMAL_PRIORITY,
      mutualOnly: false,
      fillGroups: false,
    };
    storage.saveSession(session);
    set({ sessions: [session, ...get().sessions] });
    return session;
  },

  getSession: (id: string) => get().sessions.find((s) => s.id === id),

  renameSession: (id, name) => {
    const session = get().getSession(id);
    if (!session) return;
    const updated = touch({ ...session, name });
    storage.saveSession(updated);
    set({ sessions: get().sessions.map((s) => (s.id === id ? updated : s)) });
  },

  setPeopleAndGroups: (id, people, groups) => {
    const session = get().getSession(id);
    if (!session) return;
    const updated = touch({ ...session, people, groups, result: null });
    storage.saveSession(updated);
    set({ sessions: get().sessions.map((s) => (s.id === id ? updated : s)) });
  },

  setFillUnmatched: (id, fillUnmatched) => {
    const session = get().getSession(id);
    if (!session) return;
    const updated = touch({ ...session, fillUnmatched });
    storage.saveSession(updated);
    set({ sessions: get().sessions.map((s) => (s.id === id ? updated : s)) });
  },

  setMatchingMethod: (id, matchingMethod) => {
    const session = get().getSession(id);
    if (!session) return;
    const updated = touch({ ...session, matchingMethod });
    storage.saveSession(updated);
    set({ sessions: get().sessions.map((s) => (s.id === id ? updated : s)) });
  },

  setOptimalPriority: (id, optimalPriority) => {
    const session = get().getSession(id);
    if (!session) return;
    const updated = touch({ ...session, optimalPriority });
    storage.saveSession(updated);
    set({ sessions: get().sessions.map((s) => (s.id === id ? updated : s)) });
  },

  setMutualOnly: (id, mutualOnly) => {
    const session = get().getSession(id);
    if (!session) return;
    const updated = touch({ ...session, mutualOnly });
    storage.saveSession(updated);
    set({ sessions: get().sessions.map((s) => (s.id === id ? updated : s)) });
  },

  setFillGroups: (id, fillGroups) => {
    const session = get().getSession(id);
    if (!session) return;
    const updated = touch({ ...session, fillGroups });
    storage.saveSession(updated);
    set({ sessions: get().sessions.map((s) => (s.id === id ? updated : s)) });
  },

  runMatching: (id) => {
    const session = get().getSession(id);
    if (!session) return Promise.resolve();
    set({ isMatching: true });
    // Yield a tick so the "recalculating" state can paint before the (possibly
    // slow, synchronous) matching algorithm blocks the main thread.
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        const current = get().getSession(id);
        if (!current) {
          set({ isMatching: false });
          resolve();
          return;
        }
        const mutualOnly = current.mutualOnly ?? false;
        const fillGroups = current.fillGroups ?? false;
        const fillUnmatched = current.fillUnmatched ?? false;
        const optimalPriority = current.optimalPriority ?? DEFAULT_OPTIMAL_PRIORITY;
        const matchingMethod = current.matchingMethod ?? "stable";
        const cacheOptions = { matchingMethod, fillUnmatched, optimalPriority, mutualOnly, fillGroups };

        const cached = matchCache.getCachedResult(id, current.people, current.groups, cacheOptions);
        const result =
          cached ??
          (matchingMethod === "optimal"
            ? runOptimalAssignment(current.people, current.groups, { priority: optimalPriority, mutualOnly, fillGroups })
            : runGaleShapley(current.people, current.groups, { fillUnmatched, mutualOnly, fillGroups }));
        if (!cached) matchCache.setCachedResult(id, current.people, current.groups, cacheOptions, result);

        const updated = touch({ ...current, result });
        storage.saveSession(updated);
        set({ sessions: get().sessions.map((s) => (s.id === id ? updated : s)), isMatching: false });
        resolve();
      }, 0);
    });
  },

  deleteSession: (id) => {
    storage.deleteSession(id);
    set({ sessions: get().sessions.filter((s) => s.id !== id) });
  },
}));
