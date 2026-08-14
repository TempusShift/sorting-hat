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

function parseRawRows(csvText: string): { rows: string[][]; errors: string[] } {
  const parsed = Papa.parse<string[]>(csvText.trim(), { skipEmptyLines: true });
  const errors = parsed.errors.map((e) => `Row ${(e.row ?? 0) + 1}: ${e.message}`);
  let rows = parsed.data;
  if (rows.length > 0 && (rows[0][0] ?? "").trim().toLowerCase() === "name") {
    rows = rows.slice(1);
  }
  return { rows, errors };
}

export function parsePeopleCsv(csvText: string): CsvParseResult<ParsedPersonRow> {
  const { rows, errors } = parseRawRows(csvText);
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
  const { rows, errors } = parseRawRows(csvText);
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
    const key = row.name.toLowerCase();
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
    const key = row.name.toLowerCase();
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
    const id = personIdByName.get(row.name.toLowerCase());
    const person = id ? personById.get(id) : undefined;
    if (!person) continue;
    const rankings: string[] = [];
    for (const groupName of row.rankingNames) {
      const groupId = groupIdByName.get(groupName.toLowerCase());
      if (!groupId) {
        warnings.push(`${row.name}: unknown group "${groupName}" in rankings — skipped`);
        continue;
      }
      rankings.push(groupId);
    }
    person.rankings = rankings;
  }

  for (const row of groupRows) {
    const id = groupIdByName.get(row.name.toLowerCase());
    const group = id ? groupById.get(id) : undefined;
    if (!group) continue;
    const rankings: string[] = [];
    for (const personName of row.rankingNames) {
      const personId = personIdByName.get(personName.toLowerCase());
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
