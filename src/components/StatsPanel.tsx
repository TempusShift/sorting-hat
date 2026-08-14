"use client";

import { BarChart } from "@mantine/charts";
import { Alert, Card, Group, List, Progress, SimpleGrid, Stack, Text, Title } from "@mantine/core";
import { IconAlertTriangle } from "@tabler/icons-react";
import { computeGroupFillRates, getAchievedRank } from "@/lib/algorithm";
import type { Assignment, Group as GroupEntity, Person } from "@/lib/types";

interface StatsPanelProps {
  people: Person[];
  groups: GroupEntity[];
  assignments: Assignment[];
  bumpedPersonIds?: string[];
  shiftedPersonIds?: string[];
}

export function StatsPanel({
  people,
  groups,
  assignments,
  bumpedPersonIds = [],
  shiftedPersonIds = [],
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

  return (
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

      {(bumpedPersonIds.length > 0 || shiftedPersonIds.length > 0) && (
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
          </Stack>
        </Alert>
      )}

      {distributionData.length > 0 && (
        <Card withBorder padding="md">
          <Title order={4} mb="md">
            Happiness score distribution
          </Title>
          <BarChart
            h={260}
            data={distributionData}
            dataKey="rank"
            series={[{ name: "count", color: "violet.6" }]}
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
    </Stack>
  );
}
