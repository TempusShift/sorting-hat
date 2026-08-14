export interface Session {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  people: Person[];
  groups: Group[];
  result: MatchResult | null;
  /** When true, unmatched people are backfilled into any group with open capacity. Absent on older sessions. */
  fillUnmatched?: boolean;
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
}

export interface Assignment {
  personId: string;
  groupId: string | null;
}
