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
  /** For matchingMethod "optimal": which side's preferences to weight more heavily. Defaults to "people". Absent on older sessions. */
  optimalPriority?: "people" | "balanced" | "groups";
  /** When true, a person and group can only be paired if each side ranked the other (sides with no stated preferences are indifferent and always satisfy this). Absent on older sessions. */
  mutualOnly?: boolean;
  /** When true, any group seats still open after matching are force-filled with remaining unmatched people, even if neither side ranked the other (still subject to mutualOnly if also set). Absent on older sessions. */
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
  /** People seated into a group via fillGroups despite neither side ranking the other. */
  forcedPersonIds: string[];
}

export interface Assignment {
  personId: string;
  groupId: string | null;
}
