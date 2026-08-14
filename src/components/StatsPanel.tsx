"use client";

import { useState } from "react";
import { BarChart } from "@mantine/charts";
import {
  Alert,
  Card,
  Group,
  List,
  SegmentedControl,
  SimpleGrid,
  Stack,
  Table,
  Tabs,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { IconAlertTriangle, IconSearch } from "@tabler/icons-react";
import {
  buildBumpEvictionIndex,
  computeGroupFillRates,
  getAchievedRank,
  getAdjustedGroupHappiness,
  getAdjustedPersonHappiness,
  getGroupAchievedRank,
} from "@/lib/algorithm";
import { SortableHeader, useSearchSort } from "@/components/SortableTable";
import type { Assignment, BumpDetail, Group as GroupEntity, Person } from "@/lib/types";

type GroupStatsSortKey = "name" | "assigned" | "mean" | "unranked";

interface StatsPanelProps {
  people: Person[];
  groups: GroupEntity[];
  assignments: Assignment[];
  bumpedPersonIds?: string[];
  shiftedPersonIds?: string[];
  backfilledPersonIds?: string[];
  forcedPersonIds?: string[];
  bumpDetails?: Record<string, BumpDetail>;
}

/** Builds a histogram over whatever integer range the values actually span (may include unranked-merged or bump-adjusted values below 1 or above the raw preference-list length). */
function buildDistribution(
  values: number[],
  unrankedCount: number,
  unmatchedCount: number,
  showUnrankedSeparately: boolean,
): { rank: string; count: number }[] {
  const counts = new Map<number, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  const data: { rank: string; count: number }[] = [];
  if (counts.size > 0) {
    const min = Math.min(...counts.keys());
    const max = Math.max(...counts.keys());
    for (let i = min; i <= max; i++) {
      data.push({ rank: `#${i}`, count: counts.get(i) ?? 0 });
    }
  }
  if (showUnrankedSeparately && unrankedCount > 0) {
    data.push({ rank: "Unranked match", count: unrankedCount });
  }
  if (unmatchedCount > 0) {
    data.push({ rank: "Unmatched", count: unmatchedCount });
  }
  return data;
}

export function StatsPanel({
  people,
  groups,
  assignments,
  bumpedPersonIds = [],
  shiftedPersonIds = [],
  backfilledPersonIds = [],
  forcedPersonIds = [],
  bumpDetails = {},
}: StatsPanelProps) {
  const [unrankedMode, setUnrankedMode] = useState<"separate" | "merged">("separate");
  const merged = unrankedMode === "merged";

  const assignmentByPerson = new Map(assignments.map((a) => [a.personId, a]));

  // Which people each (group, admitting person) pair evicted, for the group-side bump adjustment.
  const evictionsByGroupAndBumper = buildBumpEvictionIndex(bumpDetails);

  const ranks: number[] = [];
  const happinessScores: number[] = [];
  let unmatchedCount = 0;
  let unrankedMatchCount = 0;

  for (const person of people) {
    const groupId = assignmentByPerson.get(person.id)?.groupId ?? null;
    if (groupId === null) {
      unmatchedCount++;
      continue;
    }
    const rank = getAchievedRank(person, groupId);
    const isUnranked = rank === null;
    if (isUnranked) {
      unrankedMatchCount++;
    } else {
      ranks.push(rank);
    }
    if (!isUnranked || merged) {
      const happiness = getAdjustedPersonHappiness(person, groupId, bumpDetails[person.id]);
      if (happiness !== null) happinessScores.push(happiness);
    }
  }

  const rankSum = ranks.reduce((a, b) => a + b, 0);
  const mean = ranks.length > 0 ? rankSum / ranks.length : null;
  const sorted = [...ranks].sort((a, b) => a - b);
  const median =
    sorted.length === 0
      ? null
      : sorted.length % 2 === 1
        ? sorted[(sorted.length - 1) / 2]
        : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2;

  const happinessSum = happinessScores.reduce((a, b) => a + b, 0);
  const distributionData = buildDistribution(
    happinessScores,
    unrankedMatchCount,
    unmatchedCount,
    !merged,
  );

  const fillRates = computeGroupFillRates(groups, assignments);
  const personNameById = new Map(people.map((p) => [p.id, p.name]));

  const groupRanks: number[] = [];
  const groupHappinessScores: number[] = [];
  // One averaged score per group (its filled slots only; unfilled slots neither help nor hurt),
  // so a group's size doesn't skew its weight in the cross-group sum vs. other groups.
  const groupHappinessAverages: number[] = [];
  let groupUnrankedMatchCount = 0;
  const perGroupStats = groups.map((g) => {
    const memberIds = assignments.filter((a) => a.groupId === g.id).map((a) => a.personId);
    const ranks: number[] = [];
    const memberHappiness: number[] = [];
    let unranked = 0;
    for (const personId of memberIds) {
      const rank = getGroupAchievedRank(g, personId);
      const isUnranked = rank === null;
      if (isUnranked) {
        unranked++;
        groupUnrankedMatchCount++;
      } else {
        ranks.push(rank);
        groupRanks.push(rank);
      }
      if (!isUnranked || merged) {
        const evicted = evictionsByGroupAndBumper.get(`${g.id}|${personId}`) ?? [];
        const happiness = getAdjustedGroupHappiness(g, personId, evicted);
        if (happiness !== null) {
          groupHappinessScores.push(happiness);
          memberHappiness.push(happiness);
        }
      }
    }
    if (memberHappiness.length > 0) {
      groupHappinessAverages.push(
        memberHappiness.reduce((a, b) => a + b, 0) / memberHappiness.length,
      );
    }
    const groupMean = ranks.length > 0 ? ranks.reduce((a, b) => a + b, 0) / ranks.length : null;
    return {
      groupId: g.id,
      name: g.name,
      assigned: memberIds.length,
      capacity: g.capacity,
      mean: groupMean,
      unranked,
    };
  });

  const groupRankSum = groupRanks.reduce((a, b) => a + b, 0);
  const groupMean = groupRanks.length > 0 ? groupRankSum / groupRanks.length : null;
  const sortedGroupRanks = [...groupRanks].sort((a, b) => a - b);
  const groupMedian =
    sortedGroupRanks.length === 0
      ? null
      : sortedGroupRanks.length % 2 === 1
        ? sortedGroupRanks[(sortedGroupRanks.length - 1) / 2]
        : (sortedGroupRanks[sortedGroupRanks.length / 2 - 1] +
            sortedGroupRanks[sortedGroupRanks.length / 2]) /
          2;

  const groupHappinessSum = groupHappinessAverages.reduce((a, b) => a + b, 0);
  const groupDistributionData = buildDistribution(
    groupHappinessScores,
    groupUnrankedMatchCount,
    0,
    !merged,
  );

  const {
    search: groupTableSearch,
    setSearch: setGroupTableSearch,
    sortKey: groupTableSortKey,
    sortDirection: groupTableSortDirection,
    handleSort: handleGroupTableSort,
    rows: groupTableRows,
  } = useSearchSort<(typeof perGroupStats)[number], GroupStatsSortKey>(
    perGroupStats,
    (row, query) => row.name.toLowerCase().includes(query),
    {
      name: (a, b) => a.name.localeCompare(b.name),
      assigned: (a, b) => a.assigned - b.assigned,
      mean: (a, b) => (a.mean ?? Infinity) - (b.mean ?? Infinity),
      unranked: (a, b) => a.unranked - b.unranked,
    },
  );

  const emptySeats = fillRates.reduce((sum, f) => sum + Math.max(0, f.capacity - f.assigned), 0);

  return (
    <Stack>
      {(bumpedPersonIds.length > 0 ||
        shiftedPersonIds.length > 0 ||
        backfilledPersonIds.length > 0 ||
        forcedPersonIds.length > 0) && (
        <Alert color="yellow" icon={<IconAlertTriangle size={16} />} title="Affected by contention">
          <Stack gap="xs">
            {bumpedPersonIds.length > 0 && (
              <div>
                <Text size="sm" fw={500}>
                  Bumped from a tentative match ({bumpedPersonIds.length})
                </Text>
                <Text size="xs" c="dimmed" mb={4}>
                  Someone the group preferred more took their spot; they may have landed elsewhere.
                </Text>
                <List size="sm">
                  {bumpedPersonIds.map((id) => (
                    <List.Item key={id}>{personNameById.get(id) ?? id}</List.Item>
                  ))}
                </List>
              </div>
            )}
            {shiftedPersonIds.length > 0 && (
              <div>
                <Text size="sm" fw={500}>
                  Shifted to another group they ranked ({shiftedPersonIds.length})
                </Text>
                <Text size="xs" c="dimmed" mb={4}>
                  Moved off their original match, within their own ranked groups, to make room for
                  someone who otherwise had no options left.
                </Text>
                <List size="sm">
                  {shiftedPersonIds.map((id) => (
                    <List.Item key={id}>{personNameById.get(id) ?? id}</List.Item>
                  ))}
                </List>
              </div>
            )}
            {backfilledPersonIds.length > 0 && (
              <div>
                <Text size="sm" fw={500}>
                  Seated by shifting others ({backfilledPersonIds.length})
                </Text>
                <Text size="xs" c="dimmed" mb={4}>
                  Left unmatched by stable matching at first; shifting other people opened a seat in
                  one of their own ranked groups.
                </Text>
                <List size="sm">
                  {backfilledPersonIds.map((id) => (
                    <List.Item key={id}>{personNameById.get(id) ?? id}</List.Item>
                  ))}
                </List>
              </div>
            )}
            {forcedPersonIds.length > 0 && (
              <div>
                <Text size="sm" fw={500}>
                  Forced into an unranked group ({forcedPersonIds.length})
                </Text>
                <Text size="xs" c="dimmed" mb={4}>
                  Left unmatched with no eligible group left; seated to fill an open seat despite
                  neither side ranking the other.
                </Text>
                <List size="sm">
                  {forcedPersonIds.map((id) => (
                    <List.Item key={id}>{personNameById.get(id) ?? id}</List.Item>
                  ))}
                </List>
              </div>
            )}
          </Stack>
        </Alert>
      )}

      <Group justify="space-between" wrap="wrap">
        <Text size="sm" fw={500}>
          Unranked matches
        </Text>
        <SegmentedControl
          size="xs"
          value={unrankedMode}
          onChange={(v: string) => setUnrankedMode(v as "separate" | "merged")}
          data={[
            { label: "Show separately", value: "separate" },
            { label: "Merge as rank N+1", value: "merged" },
          ]}
        />
      </Group>
      <Text size="xs" c="dimmed">
        {merged
          ? "A match to a group/person that wasn't ranked at all scores one worse than that side's least-preferred ranked option — e.g. ranking 5 people means anyone unranked scores as rank 6."
          : "Matches to a group/person that wasn't ranked at all are broken out as their own bucket, separate from the numbered ranks."}
      </Text>

      <Tabs defaultValue="person">
        <Tabs.List mb="md">
          <Tabs.Tab value="person">By person</Tabs.Tab>
          <Tabs.Tab value="group">By group</Tabs.Tab>
          <Tabs.Tab value="sum">Sum score</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="person">
          <Stack>
            <SimpleGrid cols={{ base: 1, sm: 3 }}>
              <Card withBorder padding="md">
                <Text size="sm" c="dimmed">
                  Mean rank achieved
                </Text>
                <Text size="xl" fw={700}>
                  {mean !== null ? mean.toFixed(2) : "—"}
                </Text>
              </Card>
              <Card withBorder padding="md">
                <Text size="sm" c="dimmed">
                  Median rank achieved
                </Text>
                <Text size="xl" fw={700}>
                  {median !== null ? median : "—"}
                </Text>
              </Card>
              <Card withBorder padding="md">
                <Text size="sm" c="dimmed">
                  Unmatched
                </Text>
                <Text size="xl" fw={700}>
                  {unmatchedCount}
                </Text>
              </Card>
            </SimpleGrid>

            {distributionData.length > 0 && (
              <Card withBorder padding="md">
                <Title order={4} mb="md">
                  Happiness score distribution
                </Title>
                <Text size="xs" c="dimmed" mb="md">
                  How well people did against their own preference lists. Anyone bumped from a
                  tentative match has their score shifted by the gap between the group they lost
                  and the one they landed in.
                </Text>
                <BarChart
                  h={260}
                  data={distributionData}
                  dataKey="rank"
                  series={[{ name: "count", color: "violet.6" }]}
                />
              </Card>
            )}
          </Stack>
        </Tabs.Panel>

        <Tabs.Panel value="group">
          <Stack>
            <SimpleGrid cols={{ base: 1, sm: 3 }}>
              <Card withBorder padding="md">
                <Text size="sm" c="dimmed">
                  Mean rank achieved
                </Text>
                <Text size="xl" fw={700}>
                  {groupMean !== null ? groupMean.toFixed(2) : "—"}
                </Text>
              </Card>
              <Card withBorder padding="md">
                <Text size="sm" c="dimmed">
                  Median rank achieved
                </Text>
                <Text size="xl" fw={700}>
                  {groupMedian !== null ? groupMedian : "—"}
                </Text>
              </Card>
              <Card withBorder padding="md">
                <Text size="sm" c="dimmed">
                  Empty seats
                </Text>
                <Text size="xl" fw={700}>
                  {emptySeats}
                </Text>
              </Card>
            </SimpleGrid>

            {groupDistributionData.length > 0 && (
              <Card withBorder padding="md">
                <Title order={4} mb="md">
                  Happiness score distribution
                </Title>
                <Text size="xs" c="dimmed" mb="md">
                  How well groups did against their own preference lists for the people they were
                  assigned. Any eviction a group made to seat someone shifts its score by the gap
                  between the person it let go and the one it kept.
                </Text>
                <BarChart
                  h={260}
                  data={groupDistributionData}
                  dataKey="rank"
                  series={[{ name: "count", color: "teal.6" }]}
                />
              </Card>
            )}

            <Card withBorder padding="md">
              <Title order={4} mb="md">
                By group breakdown
              </Title>
              <TextInput
                placeholder="Search by group"
                leftSection={<IconSearch size={16} />}
                value={groupTableSearch}
                onChange={(e) => setGroupTableSearch(e.currentTarget.value)}
                mb="md"
                maw={400}
              />
              <Table.ScrollContainer minWidth={400}>
                <Table striped highlightOnHover withTableBorder>
                  <Table.Thead>
                    <Table.Tr>
                      <SortableHeader
                        label="Group"
                        sortKey="name"
                        currentSort={groupTableSortKey}
                        currentDirection={groupTableSortDirection}
                        onSort={handleGroupTableSort}
                      />
                      <SortableHeader
                        label="Assigned"
                        sortKey="assigned"
                        currentSort={groupTableSortKey}
                        currentDirection={groupTableSortDirection}
                        onSort={handleGroupTableSort}
                      />
                      <SortableHeader
                        label="Mean rank achieved"
                        sortKey="mean"
                        currentSort={groupTableSortKey}
                        currentDirection={groupTableSortDirection}
                        onSort={handleGroupTableSort}
                      />
                      <SortableHeader
                        label="Unranked matches"
                        sortKey="unranked"
                        currentSort={groupTableSortKey}
                        currentDirection={groupTableSortDirection}
                        onSort={handleGroupTableSort}
                      />
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {groupTableRows.map((g) => (
                      <Table.Tr key={g.groupId}>
                        <Table.Td>{g.name}</Table.Td>
                        <Table.Td>
                          {g.assigned} / {g.capacity}
                        </Table.Td>
                        <Table.Td>{g.mean !== null ? g.mean.toFixed(2) : "—"}</Table.Td>
                        <Table.Td>{g.unranked}</Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              </Table.ScrollContainer>
            </Card>
          </Stack>
        </Tabs.Panel>

        <Tabs.Panel value="sum">
          <Stack>
            <Text size="sm" c="dimmed">
              Happiness score, added up across everyone matched. <strong>Lower is happier</strong> — a low sum
              means people and groups are, on average, landing near the top of their own lists.
              Bumped people and the groups that bumped them have their score shifted by the rank
              gap the eviction caused.
            </Text>
            <SimpleGrid cols={{ base: 1, sm: 2 }}>
              <Card withBorder padding="md">
                <Text size="sm" c="dimmed">
                  Sum of happiness scores (people)
                </Text>
                <Text size="xl" fw={700}>
                  {happinessScores.length > 0 ? happinessSum : "—"}
                </Text>
                <Text size="xs" c="dimmed" mt={4}>
                  Across {happinessScores.length} scored{" "}
                  {happinessScores.length === 1 ? "match" : "matches"}
                  {!merged && (unrankedMatchCount > 0 || unmatchedCount > 0)
                    ? ` (excludes ${unrankedMatchCount} unranked match${
                        unrankedMatchCount === 1 ? "" : "es"
                      } and ${unmatchedCount} unmatched)`
                    : merged && unmatchedCount > 0
                      ? ` (excludes ${unmatchedCount} unmatched)`
                      : ""}
                </Text>
              </Card>
              <Card withBorder padding="md">
                <Text size="sm" c="dimmed">
                  Sum of happiness scores (groups)
                </Text>
                <Text size="xl" fw={700}>
                  {groupHappinessAverages.length > 0 ? groupHappinessSum.toFixed(2) : "—"}
                </Text>
                <Text size="xs" c="dimmed" mt={4}>
                  Across {groupHappinessAverages.length} scored{" "}
                  {groupHappinessAverages.length === 1 ? "group" : "groups"}, each averaged across
                  its own filled slots so group size doesn&apos;t skew the total
                  {!merged && groupUnrankedMatchCount > 0
                    ? ` (excludes ${groupUnrankedMatchCount} unranked match${
                        groupUnrankedMatchCount === 1 ? "" : "es"
                      })`
                    : ""}
                </Text>
              </Card>
            </SimpleGrid>
          </Stack>
        </Tabs.Panel>
      </Tabs>
    </Stack>
  );
}
