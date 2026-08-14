import Papa from "papaparse";
import { v4 as uuidv4 } from "uuid";
import { getAchievedRank } from "./algorithm";
import type { Assignment, Group, Person } from "./types";

export interface ParsedPersonRow {
  name: string;
  rankingNames: string[];
}

export interface ParsedGroupRow {
  name: string;
  capacity: number;
  rankingNames: string[];
}

export interface CsvParseResult<T> {
  rows: T[];
  errors: string[];
}

/** Case/punctuation/whitespace-insensitive key so free-typed names (e.g. across two different form exports) still cross-reference — "PLA- Quickstart" and "PLA QuickStart" collapse to the same key. */
function normalizeNameKey(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function parseRawRows(csvText: string): { header: string[] | null; rows: string[][]; errors: string[] } {
  const parsed = Papa.parse<string[]>(csvText.trim(), { skipEmptyLines: true });
  const errors = parsed.errors.map((e) => `Row ${(e.row ?? 0) + 1}: ${e.message}`);
  const rows = parsed.data;
  const header = rows.length > 0 ? rows[0] : null;
  return { header, rows, errors };
}

// Undocumented fallback support for Microsoft/Google Forms "preference survey" exports
// (e.g. rolling-match style talent/team preference forms). Not part of the public CSV spec —
// detected structurally so it keeps working across differently-worded survey questions.
const FORM_EXPORT_PREFIX = ["id", "start time", "completion time", "email", "name"];

function isFormsExportHeader(header: string[] | null): header is string[] {
  if (!header) return false;
  return FORM_EXPORT_PREFIX.every((expected, i) => (header[i] ?? "").trim().toLowerCase() === expected);
}

/** True for a header cell asking "which X are you ranking your preferences for?" — marks a groups-side form export. */
function isRankingForColumn(headerCell: string | undefined): boolean {
  return /ranking your preferences for/i.test(headerCell ?? "");
}

function parsePeopleFormRows(dataRows: string[][], errors: string[]): ParsedPersonRow[] {
  const result: ParsedPersonRow[] = [];
  dataRows.forEach((row, i) => {
    const name = (row[4] ?? "").trim();
    if (!name) {
      errors.push(`Row ${i + 2}: missing person name`);
      return;
    }
    const rankingNames = row
      .slice(5)
      .map((c) => c.trim())
      .filter(Boolean);
    result.push({ name, rankingNames });
  });
  return result;
}

/** Each row is one respondent's ranking for a team; capacity is absent, so rows are merged per team: capacity = row count, rankings = union in first-seen order. */
function parseGroupsFormRows(dataRows: string[][], errors: string[]): ParsedGroupRow[] {
  const byName = new Map<string, ParsedGroupRow>();
  const order: string[] = [];
  dataRows.forEach((row, i) => {
    const name = (row[5] ?? "").trim();
    if (!name) {
      errors.push(`Row ${i + 2}: missing group name`);
      return;
    }
    const rankingNames = row
      .slice(6)
      .map((c) => c.trim())
      .filter(Boolean);
    const key = normalizeNameKey(name);
    const existing = byName.get(key);
    if (existing) {
      existing.capacity += 1;
      for (const n of rankingNames) {
        if (!existing.rankingNames.includes(n)) existing.rankingNames.push(n);
      }
    } else {
      byName.set(key, { name, capacity: 1, rankingNames: [...rankingNames] });
      order.push(key);
    }
  });
  return order.map((key) => byName.get(key)!);
}

export function parsePeopleCsv(csvText: string): CsvParseResult<ParsedPersonRow> {
  const { header, rows: allRows, errors } = parseRawRows(csvText);
  if (isFormsExportHeader(header) && !isRankingForColumn(header[5])) {
    return { rows: parsePeopleFormRows(allRows.slice(1), errors), errors };
  }
  let rows = allRows;
  if (rows.length > 0 && (rows[0][0] ?? "").trim().toLowerCase() === "name") {
    rows = rows.slice(1);
  }
  const result: ParsedPersonRow[] = [];
  rows.forEach((row, i) => {
    const name = (row[0] ?? "").trim();
    if (!name) {
      errors.push(`Row ${i + 1}: missing person name`);
      return;
    }
    const rankingNames = row
      .slice(1)
      .map((c) => c.trim())
      .filter(Boolean);
    result.push({ name, rankingNames });
  });
  return { rows: result, errors };
}

export function parseGroupsCsv(csvText: string): CsvParseResult<ParsedGroupRow> {
  const { header, rows: allRows, errors } = parseRawRows(csvText);
  if (isFormsExportHeader(header) && isRankingForColumn(header[5])) {
    return { rows: parseGroupsFormRows(allRows.slice(1), errors), errors };
  }
  let rows = allRows;
  if (rows.length > 0 && (rows[0][0] ?? "").trim().toLowerCase() === "name") {
    rows = rows.slice(1);
  }
  const result: ParsedGroupRow[] = [];
  rows.forEach((row, i) => {
    const name = (row[0] ?? "").trim();
    if (!name) {
      errors.push(`Row ${i + 1}: missing group name`);
      return;
    }
    const capacityRaw = (row[1] ?? "").trim();
    const capacity = Number.parseInt(capacityRaw, 10);
    if (!Number.isFinite(capacity) || capacity < 0) {
      errors.push(`Row ${i + 1}: invalid capacity "${capacityRaw}" for group "${name}"`);
      return;
    }
    const rankingNames = row
      .slice(2)
      .map((c) => c.trim())
      .filter(Boolean);
    result.push({ name, capacity, rankingNames });
  });
  return { rows: result, errors };
}

export interface BuildEntitiesResult {
  people: Person[];
  groups: Group[];
  warnings: string[];
}

/** Converts name-keyed CSV rows into id-linked Person/Group entities, flagging unknown references. */
export function buildSessionEntities(
  personRows: ParsedPersonRow[],
  groupRows: ParsedGroupRow[],
): BuildEntitiesResult {
  const warnings: string[] = [];

  const groupIdByName = new Map<string, string>();
  const groups: Group[] = [];
  for (const row of groupRows) {
    const key = normalizeNameKey(row.name);
    if (groupIdByName.has(key)) {
      warnings.push(`Duplicate group name "${row.name}" — ignoring duplicate row`);
      continue;
    }
    const id = uuidv4();
    groupIdByName.set(key, id);
    groups.push({ id, name: row.name, capacity: row.capacity, rankings: [] });
  }

  const personIdByName = new Map<string, string>();
  const people: Person[] = [];
  for (const row of personRows) {
    const key = normalizeNameKey(row.name);
    if (personIdByName.has(key)) {
      warnings.push(`Duplicate person name "${row.name}" — ignoring duplicate row`);
      continue;
    }
    const id = uuidv4();
    personIdByName.set(key, id);
    people.push({ id, name: row.name, rankings: [] });
  }

  const groupById = new Map(groups.map((g) => [g.id, g]));
  const personById = new Map(people.map((p) => [p.id, p]));

  for (const row of personRows) {
    const id = personIdByName.get(normalizeNameKey(row.name));
    const person = id ? personById.get(id) : undefined;
    if (!person) continue;
    const rankings: string[] = [];
    for (const groupName of row.rankingNames) {
      const groupId = groupIdByName.get(normalizeNameKey(groupName));
      if (!groupId) {
        warnings.push(`${row.name}: unknown group "${groupName}" in rankings — skipped`);
        continue;
      }
      rankings.push(groupId);
    }
    person.rankings = rankings;
  }

  for (const row of groupRows) {
    const id = groupIdByName.get(normalizeNameKey(row.name));
    const group = id ? groupById.get(id) : undefined;
    if (!group) continue;
    const rankings: string[] = [];
    for (const personName of row.rankingNames) {
      const personId = personIdByName.get(normalizeNameKey(personName));
      if (!personId) {
        warnings.push(`${row.name}: unknown person "${personName}" in rankings — skipped`);
        continue;
      }
      rankings.push(personId);
    }
    group.rankings = rankings;
  }

  return { people, groups, warnings };
}

export function peopleToCsv(people: Person[], groups: Group[]): string {
  const groupNameById = new Map(groups.map((g) => [g.id, g.name]));
  const maxRankings = Math.max(0, ...people.map((p) => p.rankings.length));
  const header = ["name", ...Array.from({ length: maxRankings }, (_, i) => `rank${i + 1}`)];
  const rows = people.map((p) => [p.name, ...p.rankings.map((id) => groupNameById.get(id) ?? "")]);
  return Papa.unparse([header, ...rows]);
}

export function groupsToCsv(groups: Group[], people: Person[]): string {
  const personNameById = new Map(people.map((p) => [p.id, p.name]));
  const maxRankings = Math.max(0, ...groups.map((g) => g.rankings.length));
  const header = ["name", "capacity", ...Array.from({ length: maxRankings }, (_, i) => `rank${i + 1}`)];
  const rows = groups.map((g) => [g.name, String(g.capacity), ...g.rankings.map((id) => personNameById.get(id) ?? "")]);
  return Papa.unparse([header, ...rows]);
}

export function exportAssignmentsCsv(people: Person[], groups: Group[], assignments: Assignment[]): string {
  const groupNameById = new Map(groups.map((g) => [g.id, g.name]));
  const personById = new Map(people.map((p) => [p.id, p]));

  const rows = assignments.map((a) => {
    const person = personById.get(a.personId);
    const rank = person ? getAchievedRank(person, a.groupId) : null;
    return {
      name: person?.name ?? a.personId,
      group: a.groupId ? (groupNameById.get(a.groupId) ?? "") : "",
      rank_achieved: rank ?? "",
    };
  });

  return Papa.unparse(rows, { columns: ["name", "group", "rank_achieved"] });
}
