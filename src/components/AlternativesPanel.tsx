"use client";

import { Table } from "@mantine/core";
import { computeAlternatives, type MatchingMethod, type OptimalPriority } from "@/lib/algorithm";
import type { Assignment, Group, Person } from "@/lib/types";

interface AlternativesPanelProps {
  people: Person[];
  groups: Group[];
  assignments: Assignment[];
  fillUnmatched?: boolean;
  matchingMethod?: MatchingMethod;
  optimalPriority?: OptimalPriority;
  mutualOnly?: boolean;
  fillGroups?: boolean;
}

export function AlternativesPanel({
  people,
  groups,
  assignments,
  fillUnmatched,
  matchingMethod,
  optimalPriority,
  mutualOnly,
  fillGroups,
}: AlternativesPanelProps) {
  const alternatives = computeAlternatives(people, groups, assignments, {
    fillUnmatched,
    method: matchingMethod,
    priority: optimalPriority,
    mutualOnly,
    fillGroups,
  });
  const groupNameById = new Map(groups.map((g) => [g.id, g.name]));
  const assignmentByPerson = new Map(assignments.map((a) => [a.personId, a]));

  const rows = [...people].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <Table.ScrollContainer minWidth={500}>
      <Table striped highlightOnHover withTableBorder>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Person</Table.Th>
            <Table.Th>Assigned group</Table.Th>
            <Table.Th>Alternative if removed</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {rows.map((person) => {
            const groupId = assignmentByPerson.get(person.id)?.groupId ?? null;
            const alt = alternatives.get(person.id) ?? null;
            return (
              <Table.Tr key={person.id}>
                <Table.Td>{person.name}</Table.Td>
                <Table.Td>{groupId ? groupNameById.get(groupId) : "—"}</Table.Td>
                <Table.Td>{alt ? groupNameById.get(alt) : "—"}</Table.Td>
              </Table.Tr>
            );
          })}
        </Table.Tbody>
      </Table>
    </Table.ScrollContainer>
  );
}
