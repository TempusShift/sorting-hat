"use client";

import { ActionIcon, Badge, Card, Group, Stack, Text } from "@mantine/core";
import { IconTrash, IconUsersGroup } from "@tabler/icons-react";
import Link from "next/link";
import type { Session } from "@/lib/types";

interface SessionCardProps {
  session: Session;
  onDelete: (id: string) => void;
}

export function SessionCard({ session, onDelete }: SessionCardProps) {
  const href = session.result ? `/session/${session.id}/results` : `/session/${session.id}/setup`;

  return (
    <Card withBorder padding="lg" radius="md" component={Link} href={href}>
      <Group justify="space-between" align="flex-start" wrap="nowrap">
        <Stack gap={4} style={{ minWidth: 0 }}>
          <Text fw={600} truncate>
            {session.name}
          </Text>
          <Text size="sm" c="dimmed">
            Updated {new Date(session.updatedAt).toLocaleDateString()}
          </Text>
        </Stack>
        <ActionIcon
          variant="subtle"
          color="red"
          aria-label={`Delete ${session.name}`}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (window.confirm(`Delete session "${session.name}"? This cannot be undone.`)) {
              onDelete(session.id);
            }
          }}
        >
          <IconTrash size={18} />
        </ActionIcon>
      </Group>

      <Group gap="xs" mt="md">
        <Badge variant="light" leftSection={<IconUsersGroup size={12} />}>
          {session.people.length} {session.people.length === 1 ? "person" : "people"}
        </Badge>
        <Badge variant="light">
          {session.groups.length} {session.groups.length === 1 ? "group" : "groups"}
        </Badge>
        {session.result && (
          <Badge variant="light" color="green">
            Matched
          </Badge>
        )}
      </Group>
    </Card>
  );
}
