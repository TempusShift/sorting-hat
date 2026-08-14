"use client";

import { BarChart } from "@mantine/charts";
import {
  Alert,
  Card,
  Group,
  List,
  Progress,
  SimpleGrid,
  Stack,
  Table,
  Tabs,
  Text,
  Title,
} from "@mantine/core";
import { IconAlertTriangle } from "@tabler/icons-react";
import { computeGroupFillRates, getAchievedRank, getGroupAchievedRank } from "@/lib/algorithm";
import type { Assignment, Group as GroupEntity, Person } from "@/lib/types";

interface StatsPanelProps {
  people: Person[];
  groups: GroupEntity[];
  assignments: Assignment[];
  bumpedPersonIds?: string[];
  shiftedPersonIds?: string[];
  backfilledPersonIds?: string[];
}

export function StatsPanel({
  people,
  groups,
  assignments,
  bumpedPersonIds = [],
  shiftedPersonIds = [],
  backfilledPersonIds = [],
}: StatsPanelProps) {
  const assignmentByPerson = new Map(assignments.map((a) => [a.personId, a]));
  const ranks: number[] = [];
  let unmatchedCount = 0;
  let unrankedMatchCount = 0;

  for (const person of people) {
    const groupId = assignmentByPerson.get(person.id)?.groupId ?? null;
    if (groupId === null) {
      unmatchedCount++;
      continue;
    }
    const rank = getAchievedRank(person, groupId);
    if (rank === null) {
      unrankedMatchCount++;
    } else {
      ranks.push(rank);
    }
  }

  const mean = ranks.length > 0 ? ranks.reduce((a, b) => a + b, 0) / ranks.length : null;
  const sorted = [...ranks].sort((a, b) => a - b);
  const median =
    sorted.length === 0
      ? null
      : sorted.length % 2 === 1
        ? sorted[(sorted.length - 1) / 2]
        : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2;

  const distributionMap = new Map<number, number>();
  for (const r of ranks) distributionMap.set(r, (distributionMap.get(r) ?? 0) + 1);
  const maxRank = ranks.length > 0 ? Math.max(...ranks) : 0;
  const distributionData = Array.from({ length: maxRank }, (_, i) => ({
    rank: `#${i + 1}`,
    count: distributionMap.get(i + 1) ?? 0,
  }));
  if (unrankedMatchCount > 0) {
    distributionData.push({ rank: "Unranked match", count: unrankedMatchCount });
  }
  if (unmatchedCount > 0) {
    distributionData.push({ rank: "Unmatched", count: unmatchedCount });
  }

  const fillRates = computeGroupFillRates(groups, assignments);
  const groupNameById = new Map(groups.map((g) => [g.id, g.name]));
  const personNameById = new Map(people.map((p) => [p.id, p.name]));

  const groupRanks: number[] = [];
  let groupUnrankedMatchCount = 0;
  const perGroupStats = groups.map((g) => {
    const memberIds = assignments.filter((a) => a.groupId === g.id).map((a) => a.personId);
    const ranks: number[] = [];
    let unranked = 0;
    for (const personId of memberIds) {
      const rank = getGroupAchievedRank(g, personId);
      if (rank === null) {
        unranked++;
        groupUnrankedMatchCount++;
      } else {
        ranks.push(rank);
        groupRanks.push(rank);
      }
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

  const groupMean =
    groupRanks.length > 0 ? groupRanks.reduce((a, b) => a + b, 0) / groupRanks.length : null;
  const sortedGroupRanks = [...groupRanks].sort((a, b) => a - b);
  const groupMedian =
    sortedGroupRanks.length === 0
      ? null
      : sortedGroupRanks.length % 2 === 1
        ? sortedGroupRanks[(sortedGroupRanks.length - 1) / 2]
        : (sortedGroupRanks[sortedGroupRanks.length / 2 - 1] +
            sortedGroupRanks[sortedGroupRanks.length / 2]) /
          2;

  const groupDistributionMap = new Map<number, number>();
  for (const r of groupRanks) groupDistributionMap.set(r, (groupDistributionMap.get(r) ?? 0) + 1);
  const maxGroupRank = groupRanks.length > 0 ? Math.max(...groupRanks) : 0;
  const groupDistributionData = Array.from({ length: maxGroupRank }, (_, i) => ({
    rank: `#${i + 1}`,
    count: groupDistributionMap.get(i + 1) ?? 0,
  }));
  if (groupUnrankedMatchCount > 0) {
    groupDistributionData.push({ rank: "Unranked match", count: groupUnrankedMatchCount });
  }

  const emptySeats = fillRates.reduce((sum, f) => sum + Math.max(0, f.capacity - f.assigned), 0);

  return (
    <Stack>
      {(bumpedPersonIds.length > 0 || shiftedPersonIds.length > 0 || backfilledPersonIds.length > 0) && (
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
          </Stack>
        </Alert>
      )}

      <Tabs defaultValue="person">
        <Tabs.List mb="md">
          <Tabs.Tab value="person">By person</Tabs.Tab>
          <Tabs.Tab value="group">By group</Tabs.Tab>
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
                  How well people did against their own preference lists.
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
                  assigned.
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
                Group fill rates
              </Title>
              <Stack gap="sm">
                {fillRates.map((f) => (
                  <Stack key={f.groupId} gap={4}>
                    <Group justify="space-between">
                      <Text size="sm">{groupNameById.get(f.groupId)}</Text>
                      <Text size="sm" c="dimmed">
                        {f.assigned} / {f.capacity}
                      </Text>
                    </Group>
                    <Progress value={f.capacity > 0 ? (f.assigned / f.capacity) * 100 : 0} />
                  </Stack>
                ))}
              </Stack>
            </Card>

            <Card withBorder padding="md">
              <Title order={4} mb="md">
                By group breakdown
              </Title>
              <Table.ScrollContainer minWidth={400}>
                <Table striped highlightOnHover withTableBorder>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>Group</Table.Th>
                      <Table.Th>Assigned</Table.Th>
                      <Table.Th>Mean rank achieved</Table.Th>
                      <Table.Th>Unranked matches</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {perGroupStats.map((g) => (
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
      </Tabs>
    </Stack>
  );
}
