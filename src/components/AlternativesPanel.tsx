"use client";

import { useMemo, type ReactNode } from "react";
import { Group as MantineGroup, Stack, Table, Text, TextInput, Tooltip } from "@mantine/core";
import { IconInfoCircle, IconSearch } from "@tabler/icons-react";
import { computeAlternatives } from "@/lib/algorithm";
import { SortableHeader, useSearchSort } from "@/components/SortableTable";
import type { Assignment, BumpDetail, Group, Person } from "@/lib/types";

interface AlternativesPanelProps {
  people: Person[];
  groups: Group[];
  assignments: Assignment[];
  mutualOnly?: boolean;
  bumpDetails?: Record<string, BumpDetail>;
}

type SortKey = "person" | "group" | "alternative" | "peopleDelta" | "groupDelta";

interface Row {
  person: Person;
  groupId: string | null;
  groupName: string;
  altGroupId: string | null;
  altGroupName: string;
  peopleHappinessDelta: number | null;
  groupHappinessDelta: number | null;
}

const DELTA_EXPLANATION =
  "Happiness scores are rank-based: lower is happier (rank #1 beats rank #5). This is the net change across the two affected groups — the seat this person would vacate, and the open seat they'd fill — if they made this move. A negative number means the move would leave things happier on net; a positive number means worse off.";

/** Formats a happiness delta: signed, with lower (more negative) meaning happier overall. */
function formatDelta(delta: number | null): string {
  if (delta === null) return "—";
  if (delta === 0) return "±0";
  return delta > 0 ? `+${delta}` : `${delta}`;
}

function DeltaCell({ delta }: { delta: number | null }) {
  const color = delta === null || delta === 0 ? undefined : delta > 0 ? "red" : "teal";
  return (
    <Table.Td>
      <Text c={color} fw={color ? 600 : undefined} span>
        {formatDelta(delta)}
      </Text>
    </Table.Td>
  );
}

function DeltaHeaderLabel({ children }: { children: ReactNode }) {
  return (
    <MantineGroup gap={4} wrap="nowrap">
      <span>{children}</span>
      <Tooltip label={DELTA_EXPLANATION} multiline w={300} withArrow>
        <IconInfoCircle size={14} style={{ cursor: "help" }} />
      </Tooltip>
    </MantineGroup>
  );
}

export function AlternativesPanel({
  people,
  groups,
  assignments,
  mutualOnly,
  bumpDetails = {},
}: AlternativesPanelProps) {
  const alternatives = useMemo(
    () => computeAlternatives(people, groups, assignments, { mutualOnly, bumpDetails }),
    [people, groups, assignments, mutualOnly, bumpDetails],
  );
  const groupNameById = new Map(groups.map((g) => [g.id, g.name]));
  const assignmentByPerson = new Map(assignments.map((a) => [a.personId, a]));

  const allRows: Row[] = useMemo(
    () =>
      people.map((person) => {
        const groupId = assignmentByPerson.get(person.id)?.groupId ?? null;
        const impact = alternatives.get(person.id) ?? {
          groupId: null,
          peopleHappinessDelta: null,
          groupHappinessDelta: null,
        };
        return {
          person,
          groupId,
          groupName: groupId ? groupNameById.get(groupId) ?? "" : "Unmatched",
          altGroupId: impact.groupId,
          altGroupName: impact.groupId ? groupNameById.get(impact.groupId) ?? "" : "None open",
          peopleHappinessDelta: impact.peopleHappinessDelta,
          groupHappinessDelta: impact.groupHappinessDelta,
        };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [people, assignments, alternatives, groups],
  );

  const { search, setSearch, sortKey, sortDirection, handleSort, rows } = useSearchSort<
    Row,
    SortKey
  >(
    allRows,
    (row, query) =>
      row.person.name.toLowerCase().includes(query) ||
      row.groupName.toLowerCase().includes(query) ||
      row.altGroupName.toLowerCase().includes(query),
    {
      person: (a, b) => a.person.name.localeCompare(b.person.name),
      group: (a, b) => a.groupName.localeCompare(b.groupName),
      alternative: (a, b) => a.altGroupName.localeCompare(b.altGroupName),
      peopleDelta: (a, b) => (a.peopleHappinessDelta ?? 0) - (b.peopleHappinessDelta ?? 0),
      groupDelta: (a, b) => (a.groupHappinessDelta ?? 0) - (b.groupHappinessDelta ?? 0),
    },
  );

  return (
    <Stack>
      <Text size="sm" c="dimmed">
        For each person, the best open seat they could move into <strong>right now, for free</strong> —
        no one else has to be bumped to make room. If every group they&apos;d consider is already
        full, there&apos;s no alternative without displacing someone, so none is shown. Happiness
        scores are rank-based <strong>(lower is happier)</strong>, so a{" "}
        <Text span c="teal" fw={600} inherit>
          negative Δ
        </Text>{" "}
        means that move would leave things happier on net, and a{" "}
        <Text span c="red" fw={600} inherit>
          positive Δ
        </Text>{" "}
        means worse off. Hover the <IconInfoCircle size={12} style={{ verticalAlign: "middle" }} />{" "}
        icons for details.
      </Text>
      <TextInput
        placeholder="Search by person or group"
        leftSection={<IconSearch size={16} />}
        value={search}
        onChange={(e) => setSearch(e.currentTarget.value)}
        maw={400}
      />
      <Table.ScrollContainer minWidth={600}>
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
                label="Assigned group"
                sortKey="group"
                currentSort={sortKey}
                currentDirection={sortDirection}
                onSort={handleSort}
              />
              <SortableHeader
                label="Open-seat alternative"
                sortKey="alternative"
                currentSort={sortKey}
                currentDirection={sortDirection}
                onSort={handleSort}
              />
              <SortableHeader
                label={<DeltaHeaderLabel>Δ happiness (people)</DeltaHeaderLabel>}
                sortKey="peopleDelta"
                currentSort={sortKey}
                currentDirection={sortDirection}
                onSort={handleSort}
              />
              <SortableHeader
                label={<DeltaHeaderLabel>Δ happiness (groups)</DeltaHeaderLabel>}
                sortKey="groupDelta"
                currentSort={sortKey}
                currentDirection={sortDirection}
                onSort={handleSort}
              />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {rows.map((row) => (
              <Table.Tr key={row.person.id}>
                <Table.Td>{row.person.name}</Table.Td>
                <Table.Td>{row.groupName}</Table.Td>
                <Table.Td>{row.altGroupName}</Table.Td>
                <DeltaCell delta={row.peopleHappinessDelta} />
                <DeltaCell delta={row.groupHappinessDelta} />
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Table.ScrollContainer>
    </Stack>
  );
}
