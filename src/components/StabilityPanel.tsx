"use client";

import { Alert, List, Text } from "@mantine/core";
import { IconAlertTriangle, IconCheck } from "@tabler/icons-react";
import { findBlockingPairs } from "@/lib/algorithm";
import type { Assignment, Group, Person } from "@/lib/types";

interface StabilityPanelProps {
  people: Person[];
  groups: Group[];
  assignments: Assignment[];
}

export function StabilityPanel({ people, groups, assignments }: StabilityPanelProps) {
  const pairs = findBlockingPairs(people, groups, assignments);
  const personNameById = new Map(people.map((p) => [p.id, p.name]));
  const groupNameById = new Map(groups.map((g) => [g.id, g.name]));

  if (pairs.length === 0) {
    return (
      <Alert color="green" icon={<IconCheck size={16} />} title="Matching is stable">
        No person and group would both prefer to match with each other over their current assignment.
      </Alert>
    );
  }

  return (
    <Alert
      color="yellow"
      icon={<IconAlertTriangle size={16} />}
      title={`${pairs.length} blocking pair${pairs.length === 1 ? "" : "s"} found`}
    >
      <List size="sm" mt="xs">
        {pairs.map((p, i) => (
          <List.Item key={i}>
            <Text span fw={500} inherit>
              {personNameById.get(p.personId)}
            </Text>{" "}
            and{" "}
            <Text span fw={500} inherit>
              {groupNameById.get(p.groupId)}
            </Text>{" "}
            would both prefer to match with each other over their current assignment
          </List.Item>
        ))}
      </List>
    </Alert>
  );
}
