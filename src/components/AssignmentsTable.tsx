"use client";

import { Badge, Group, Table } from "@mantine/core";
import { getAchievedRank } from "@/lib/algorithm";
import type { Assignment, Group as GroupEntity, Person } from "@/lib/types";

interface AssignmentsTableProps {
  people: Person[];
  groups: GroupEntity[];
  assignments: Assignment[];
  bumpedPersonIds?: string[];
  backfilledPersonIds?: string[];
}

export function AssignmentsTable({
  people,
  groups,
  assignments,
  bumpedPersonIds = [],
  backfilledPersonIds = [],
}: AssignmentsTableProps) {
  const groupNameById = new Map(groups.map((g) => [g.id, g.name]));
  const assignmentByPerson = new Map(assignments.map((a) => [a.personId, a]));
  const bumpedSet = new Set(bumpedPersonIds);
  const backfilledSet = new Set(backfilledPersonIds);

  const rows = [...people].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <Table.ScrollContainer minWidth={400}>
      <Table striped highlightOnHover withTableBorder>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Person</Table.Th>
            <Table.Th>Assigned group</Table.Th>
            <Table.Th>Rank achieved</Table.Th>
            <Table.Th>Notes</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {rows.map((person) => {
            const assignment = assignmentByPerson.get(person.id);
            const groupId = assignment?.groupId ?? null;
            const rank = getAchievedRank(person, groupId);
            return (
              <Table.Tr key={person.id}>
                <Table.Td>{person.name}</Table.Td>
                <Table.Td>
                  {groupId ? (
                    groupNameById.get(groupId)
                  ) : (
                    <Badge variant="light" color="red">
                      Unmatched
                    </Badge>
                  )}
                </Table.Td>
                <Table.Td>{rank ?? "—"}</Table.Td>
                <Table.Td>
                  <Group gap={4}>
                    {bumpedSet.has(person.id) && (
                      <Badge variant="light" color="orange">
                        Bumped
                      </Badge>
                    )}
                    {backfilledSet.has(person.id) && (
                      <Badge variant="light" color="blue">
                        Backfilled
                      </Badge>
                    )}
                  </Group>
                </Table.Td>
              </Table.Tr>
            );
          })}
        </Table.Tbody>
      </Table>
    </Table.ScrollContainer>
  );
}
