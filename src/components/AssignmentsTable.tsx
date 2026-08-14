"use client";

import { useMemo } from "react";
import { Badge, Group, Table, TextInput, Tooltip } from "@mantine/core";
import { IconSearch } from "@tabler/icons-react";
import { getAchievedRank, getGroupAchievedRank } from "@/lib/algorithm";
import { SortableHeader, useSearchSort } from "@/components/SortableTable";
import type {
  Assignment,
  BumpDetail,
  Group as GroupEntity,
  Person,
} from "@/lib/types";

interface AssignmentsTableProps {
  people: Person[];
  groups: GroupEntity[];
  assignments: Assignment[];
  bumpedPersonIds?: string[];
  backfilledPersonIds?: string[];
  forcedPersonIds?: string[];
  bumpDetails?: Record<string, BumpDetail>;
}

type SortKey = "person" | "group" | "personRank" | "groupRank" | "notes";

interface Row {
  person: Person;
  groupId: string | null;
  groupName: string;
  personRank: number | null;
  groupRank: number | null;
  notes: string[];
  bumpedTooltip: string | null;
  backfilledTooltip: string | null;
  forcedTooltip: string | null;
}

/** Formats a 1-indexed rank for display, or a fallback when the side never ranked the other. */
function formatRank(rank: number | null, unrankedLabel: string): string {
  return rank ? `#${rank}` : unrankedLabel;
}

export function AssignmentsTable({
  people,
  groups,
  assignments,
  bumpedPersonIds = [],
  backfilledPersonIds = [],
  forcedPersonIds = [],
  bumpDetails = {},
}: AssignmentsTableProps) {
  const groupNameById = new Map(groups.map((g) => [g.id, g.name]));
  const groupById = new Map(groups.map((g) => [g.id, g]));
  const personById = new Map(people.map((p) => [p.id, p]));
  const assignmentByPerson = new Map(assignments.map((a) => [a.personId, a]));
  const bumpedSet = new Set(bumpedPersonIds);
  const backfilledSet = new Set(backfilledPersonIds);
  const forcedSet = new Set(forcedPersonIds);

  const allRows: Row[] = useMemo(
    () =>
      people.map((person) => {
        const assignment = assignmentByPerson.get(person.id);
        const groupId = assignment?.groupId ?? null;
        const personRank = getAchievedRank(person, groupId);
        const group = groupId ? groupById.get(groupId) : undefined;
        const groupRank = groupId
          ? getGroupAchievedRank(group, person.id)
          : null;
        const notes: string[] = [];
        if (bumpedSet.has(person.id)) notes.push("Bumped");
        if (backfilledSet.has(person.id)) notes.push("Backfilled");
        if (forcedSet.has(person.id)) notes.push("Forced");

        let bumpedTooltip: string | null = null;
        const bumpDetail = bumpDetails[person.id];
        if (bumpDetail) {
          const fromGroup = groupById.get(bumpDetail.groupId);
          const byPerson = personById.get(bumpDetail.byPersonId);
          const fromGroupName = fromGroup?.name ?? "that group";
          const byPersonName = byPerson?.name ?? "someone else";
          const yourGroupRank = getGroupAchievedRank(fromGroup, person.id);
          const theirGroupRank = byPerson
            ? getGroupAchievedRank(fromGroup, byPerson.id)
            : null;
          const yourOwnRank = getAchievedRank(person, bumpDetail.groupId);
          const theirOwnRank = byPerson
            ? getAchievedRank(byPerson, bumpDetail.groupId)
            : null;
          bumpedTooltip =
            `Was tentatively placed in ${fromGroupName}, then lost the seat to ${byPersonName}. ` +
            `${fromGroupName} ranked you ${formatRank(yourGroupRank, "unranked")} vs. ${byPersonName} ${formatRank(theirGroupRank, "unranked")}. ` +
            `You had ranked ${fromGroupName} ${formatRank(yourOwnRank, "unranked")}; ${byPersonName} ranked it ${formatRank(theirOwnRank, "unranked")}.`;
        }

        let backfilledTooltip: string | null = null;
        if (backfilledSet.has(person.id)) {
          const groupName = groupId
            ? (groupNameById.get(groupId) ?? "a group")
            : "a group";
          backfilledTooltip =
            `Left unmatched by the initial matching, then seated in ${groupName} ` +
            `(${formatRank(personRank, "a group they hadn't ranked")}) by shifting other people between groups they themselves ranked, freeing up the seat.`;
        }

        let forcedTooltip: string | null = null;
        if (forcedSet.has(person.id)) {
          const groupName = groupId
            ? (groupNameById.get(groupId) ?? "a group")
            : "a group";
          forcedTooltip =
            `Placed in ${groupName} as a last resort to fill a remaining open seat, regardless of preference. ` +
            `You had ranked it ${formatRank(personRank, "not at all")}; ${groupName} had ranked you ${formatRank(groupRank, "not at all")}.`;
        }

        return {
          person,
          groupId,
          groupName: groupId ? (groupNameById.get(groupId) ?? "") : "Unmatched",
          personRank,
          groupRank,
          notes,
          bumpedTooltip,
          backfilledTooltip,
          forcedTooltip,
        };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      people,
      assignments,
      bumpedPersonIds,
      backfilledPersonIds,
      forcedPersonIds,
      bumpDetails,
      groups,
    ],
  );

  const { search, setSearch, sortKey, sortDirection, handleSort, rows } = useSearchSort<
    Row,
    SortKey
  >(
    allRows,
    (row, query) =>
      row.person.name.toLowerCase().includes(query) ||
      row.groupName.toLowerCase().includes(query) ||
      row.notes.some((note) => note.toLowerCase().includes(query)),
    {
      person: (a, b) => a.person.name.localeCompare(b.person.name),
      group: (a, b) => a.groupName.localeCompare(b.groupName),
      personRank: (a, b) => (a.personRank ?? Infinity) - (b.personRank ?? Infinity),
      groupRank: (a, b) => (a.groupRank ?? Infinity) - (b.groupRank ?? Infinity),
      notes: (a, b) => a.notes.join(", ").localeCompare(b.notes.join(", ")),
    },
  );

  return (
    <>
      <TextInput
        placeholder="Search by person, group, or note"
        leftSection={<IconSearch size={16} />}
        value={search}
        onChange={(e) => setSearch(e.currentTarget.value)}
        mb="md"
        maw={400}
      />
      <Table.ScrollContainer minWidth={400}>
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
                label="Person's pick"
                sortKey="personRank"
                currentSort={sortKey}
                currentDirection={sortDirection}
                onSort={handleSort}
              />
              <SortableHeader
                label="Group's pick"
                sortKey="groupRank"
                currentSort={sortKey}
                currentDirection={sortDirection}
                onSort={handleSort}
              />
              <SortableHeader
                label="Notes"
                sortKey="notes"
                currentSort={sortKey}
                currentDirection={sortDirection}
                onSort={handleSort}
              />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {rows.map(
              ({
                person,
                groupId,
                personRank,
                groupRank,
                notes,
                bumpedTooltip,
                backfilledTooltip,
                forcedTooltip,
              }) => (
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
                  <Table.Td>{personRank ?? "—"}</Table.Td>
                  <Table.Td>{groupRank ?? "—"}</Table.Td>
                  <Table.Td>
                    <Group gap={4}>
                      {notes.includes("Bumped") && (
                        <Tooltip
                          label={bumpedTooltip}
                          multiline
                          w={300}
                          withArrow
                          disabled={!bumpedTooltip}
                        >
                          <Badge variant="light" color="orange">
                            Bumped
                          </Badge>
                        </Tooltip>
                      )}
                      {notes.includes("Backfilled") && (
                        <Tooltip
                          label={backfilledTooltip}
                          multiline
                          w={300}
                          withArrow
                          disabled={!backfilledTooltip}
                        >
                          <Badge variant="light" color="blue">
                            Backfilled
                          </Badge>
                        </Tooltip>
                      )}
                      {notes.includes("Forced") && (
                        <Tooltip
                          label={forcedTooltip}
                          multiline
                          w={300}
                          withArrow
                          disabled={!forcedTooltip}
                        >
                          <Badge variant="light" color="grape">
                            Forced
                          </Badge>
                        </Tooltip>
                      )}
                    </Group>
                  </Table.Td>
                </Table.Tr>
              ),
            )}
          </Table.Tbody>
        </Table>
      </Table.ScrollContainer>
    </>
  );
}
