"use client";

import { Badge, Stack, Table, Text } from "@mantine/core";
import { runGaleShapley, runOptimalAssignment, type OptimalPriority } from "@/lib/algorithm";
import type { Group, Person } from "@/lib/types";

interface CompareMethodsPanelProps {
  people: Person[];
  groups: Group[];
  fillUnmatched?: boolean;
  optimalPriority?: OptimalPriority;
  mutualOnly?: boolean;
  fillGroups?: boolean;
}

export function CompareMethodsPanel({
  people,
  groups,
  fillUnmatched,
  optimalPriority,
  mutualOnly,
  fillGroups,
}: CompareMethodsPanelProps) {
  const stable = runGaleShapley(people, groups, {
    fillUnmatched: fillUnmatched ?? false,
    mutualOnly: mutualOnly ?? false,
    fillGroups: fillGroups ?? false,
  });
  const optimal = runOptimalAssignment(people, groups, {
    priority: optimalPriority ?? "people",
    mutualOnly: mutualOnly ?? false,
    fillGroups: fillGroups ?? false,
  });
  const stableGroupById = new Map(stable.assignments.map((a) => [a.personId, a.groupId]));
  const optimalGroupById = new Map(optimal.assignments.map((a) => [a.personId, a.groupId]));
  const groupNameById = new Map(groups.map((g) => [g.id, g.name]));

  const rows = [...people].sort((a, b) => a.name.localeCompare(b.name));
  const differingCount = rows.filter(
    (p) => (stableGroupById.get(p.id) ?? null) !== (optimalGroupById.get(p.id) ?? null),
  ).length;

  return (
    <Stack>
      <Text size="sm" c="dimmed">
        {differingCount === 0
          ? "Both methods produce the same assignment for everyone."
          : `${differingCount} of ${people.length} ${differingCount === 1 ? "person lands" : "people land"} in a different group depending on the method.`}
      </Text>
      <Table.ScrollContainer minWidth={500}>
        <Table striped highlightOnHover withTableBorder>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Person</Table.Th>
              <Table.Th>Stable</Table.Th>
              <Table.Th>Optimal</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {rows.map((person) => {
              const stableGroupId = stableGroupById.get(person.id) ?? null;
              const optimalGroupId = optimalGroupById.get(person.id) ?? null;
              const differs = stableGroupId !== optimalGroupId;
              return (
                <Table.Tr
                  key={person.id}
                  style={differs ? { backgroundColor: "var(--mantine-color-yellow-light)" } : undefined}
                >
                  <Table.Td>{person.name}</Table.Td>
                  <Table.Td>
                    {stableGroupId ? (
                      groupNameById.get(stableGroupId)
                    ) : (
                      <Badge variant="light" color="red">
                        Unmatched
                      </Badge>
                    )}
                  </Table.Td>
                  <Table.Td>
                    {optimalGroupId ? (
                      groupNameById.get(optimalGroupId)
                    ) : (
                      <Badge variant="light" color="red">
                        Unmatched
                      </Badge>
                    )}
                  </Table.Td>
                </Table.Tr>
              );
            })}
          </Table.Tbody>
        </Table>
      </Table.ScrollContainer>
    </Stack>
  );
}
