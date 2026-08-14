export interface Session {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  people: Person[];
  groups: Group[];
  result: MatchResult | null;
  /** When true, stable matching tries to seat unmatched people by shifting others between their own ranked groups. Absent on older sessions. */
  fillUnmatched?: boolean;
  /** Which algorithm to run. "stable" (default) is person-proposing Gale-Shapley; "optimal" minimizes weighted cost. Absent on older sessions. */
  matchingMethod?: "stable" | "optimal";
  /** For matchingMethod "optimal": which side's preferences to weight more heavily, 0-16 (0 = people only, 8 = balanced, 16 = groups only). Absent on older sessions. */
  optimalPriority?: number;
  /** When true, a person and group can only be paired if each side ranked the other (sides with no stated preferences are indifferent and always satisfy this). Absent on older sessions. */
  mutualOnly?: boolean;
  /** When true, any group still empty after matching gets one remaining unmatched person forced in, even if neither side ranked the other (still subject to mutualOnly if also set). Absent on older sessions. */
  fillGroups?: boolean;
}

export interface Person {
  id: string;
  name: string;
  rankings: string[];
}

export interface Group {
  id: string;
  name: string;
  capacity: number;
  rankings: string[];
}

export interface MatchResult {
  assignments: Assignment[];
  runAt: string;
  /** People evicted from a tentative match at least once during matching (may have been rematched). */
  bumpedPersonIds: string[];
  /** People moved to a different group they themselves ranked, to free a slot for someone else via fillUnmatched. */
  shiftedPersonIds: string[];
  /** People left unmatched by stable matching who were seated into a group via fillUnmatched. */
  backfilledPersonIds: string[];
  /** People seated into an otherwise-empty group via fillGroups despite neither side ranking the other. */
  forcedPersonIds: string[];
  /** For each bumped person, the most recent eviction: which group they lost their seat in, and who took it. */
  bumpDetails: Record<string, BumpDetail>;
}

export interface BumpDetail {
  groupId: string;
  byPersonId: string;
}

export interface Assignment {
  personId: string;
  groupId: string | null;
}
