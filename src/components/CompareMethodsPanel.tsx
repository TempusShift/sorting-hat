"use client";

import { useMemo } from "react";
import { Badge, Stack, Table, Text, TextInput } from "@mantine/core";
import { IconSearch } from "@tabler/icons-react";
import { DEFAULT_OPTIMAL_PRIORITY, runGaleShapley, runOptimalAssignment, type OptimalPriority } from "@/lib/algorithm";
import { SortableHeader, useSearchSort } from "@/components/SortableTable";
import type { Group, Person } from "@/lib/types";

interface CompareMethodsPanelProps {
  people: Person[];
  groups: Group[];
  fillUnmatched?: boolean;
  optimalPriority?: OptimalPriority;
  mutualOnly?: boolean;
  fillGroups?: boolean;
}

type SortKey = "person" | "stable" | "optimal";

interface Row {
  person: Person;
  stableGroupId: string | null;
  stableGroupName: string;
  optimalGroupId: string | null;
  optimalGroupName: string;
  differs: boolean;
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
    priority: optimalPriority ?? DEFAULT_OPTIMAL_PRIORITY,
    mutualOnly: mutualOnly ?? false,
    fillGroups: fillGroups ?? false,
  });
  const stableGroupById = new Map(stable.assignments.map((a) => [a.personId, a.groupId]));
  const optimalGroupById = new Map(optimal.assignments.map((a) => [a.personId, a.groupId]));
  const groupNameById = new Map(groups.map((g) => [g.id, g.name]));

  const allRows: Row[] = useMemo(
    () =>
      people.map((person) => {
        const stableGroupId = stableGroupById.get(person.id) ?? null;
        const optimalGroupId = optimalGroupById.get(person.id) ?? null;
        return {
          person,
          stableGroupId,
          stableGroupName: stableGroupId ? groupNameById.get(stableGroupId) ?? "" : "Unmatched",
          optimalGroupId,
          optimalGroupName: optimalGroupId ? groupNameById.get(optimalGroupId) ?? "" : "Unmatched",
          differs: stableGroupId !== optimalGroupId,
        };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [people, stable, optimal, groups],
  );

  const differingCount = allRows.filter((r) => r.differs).length;

  const { search, setSearch, sortKey, sortDirection, handleSort, rows } = useSearchSort<
    Row,
    SortKey
  >(
    allRows,
    (row, query) =>
      row.person.name.toLowerCase().includes(query) ||
      row.stableGroupName.toLowerCase().includes(query) ||
      row.optimalGroupName.toLowerCase().includes(query),
    {
      person: (a, b) => a.person.name.localeCompare(b.person.name),
      stable: (a, b) => a.stableGroupName.localeCompare(b.stableGroupName),
      optimal: (a, b) => a.optimalGroupName.localeCompare(b.optimalGroupName),
    },
  );

  return (
    <Stack>
      <Text size="sm" c="dimmed">
        {differingCount === 0
          ? "Both methods produce the same assignment for everyone."
          : `${differingCount} of ${people.length} ${differingCount === 1 ? "person lands" : "people land"} in a different group depending on the method.`}
      </Text>
      <TextInput
        placeholder="Search by person or group"
        leftSection={<IconSearch size={16} />}
        value={search}
        onChange={(e) => setSearch(e.currentTarget.value)}
        maw={400}
      />
      <Table.ScrollContainer minWidth={500}>
        <Table striped highlightOnHover withTableBorder>
          <Table.Thead>
            <Table.Tr>
              <SortableHeader
                label="Person"
                sortKey="person"
                currentSort={sortKey}
                currentDirection={sortDirection}
                onSort={handleSort}
              />
              <SortableHeader
                label="Stable"
                sortKey="stable"
                currentSort={sortKey}
                currentDirection={sortDirection}
                onSort={handleSort}
              />
              <SortableHeader
                label="Optimal"
                sortKey="optimal"
                currentSort={sortKey}
                currentDirection={sortDirection}
                onSort={handleSort}
              />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {rows.map((row) => (
              <Table.Tr
                key={row.person.id}
                style={row.differs ? { backgroundColor: "var(--mantine-color-yellow-light)" } : undefined}
              >
                <Table.Td>{row.person.name}</Table.Td>
                <Table.Td>
                  {row.stableGroupId ? (
                    row.stableGroupName
                  ) : (
                    <Badge variant="light" color="red">
                      Unmatched
                    </Badge>
                  )}
                </Table.Td>
                <Table.Td>
                  {row.optimalGroupId ? (
                    row.optimalGroupName
                  ) : (
                    <Badge variant="light" color="red">
                      Unmatched
                    </Badge>
                  )}
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Table.ScrollContainer>
    </Stack>
  );
}
