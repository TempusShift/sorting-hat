import type { MatchingMethod, OptimalPriority } from "./algorithm";
import type { Group, MatchResult, Person } from "./types";

const PREFIX = "sorting-hat:match-cache:";

export interface MatchCacheOptions {
  matchingMethod: MatchingMethod;
  fillUnmatched: boolean;
  optimalPriority: OptimalPriority;
  mutualOnly: boolean;
  fillGroups: boolean;
}

/** Cheap non-cryptographic string hash (djb2-ish), just to keep cache keys short. */
function hashString(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return (h >>> 0).toString(36);
}

function buildKey(sessionId: string, people: Person[], groups: Group[], options: MatchCacheOptions): string {
  const dataHash = hashString(JSON.stringify({ people, groups }));
  return `${PREFIX}${sessionId}:${dataHash}:${JSON.stringify(options)}`;
}

/**
 * Per-tab result cache keyed by session id, a hash of the people/group data, and the
 * matching options — so re-selecting a previously-seen combination (e.g. flipping the
 * priority slider back and forth) is instant, while any edit to people/groups or options
 * naturally misses the cache and recomputes. Backed by sessionStorage so it never
 * outlives the tab.
 */
export function getCachedResult(
  sessionId: string,
  people: Person[],
  groups: Group[],
  options: MatchCacheOptions,
): MatchResult | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(buildKey(sessionId, people, groups, options));
    return raw ? (JSON.parse(raw) as MatchResult) : null;
  } catch {
    return null;
  }
}

export function setCachedResult(
  sessionId: string,
  people: Person[],
  groups: Group[],
  options: MatchCacheOptions,
  result: MatchResult,
): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(buildKey(sessionId, people, groups, options), JSON.stringify(result));
  } catch {
    // best-effort cache; ignore quota/serialization errors
  }
}
