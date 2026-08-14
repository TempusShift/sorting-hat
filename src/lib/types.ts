export interface Session {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  people: Person[];
  groups: Group[];
  result: MatchResult | null;
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
}

export interface Assignment {
  personId: string;
  groupId: string | null;
}
