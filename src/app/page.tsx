"use client";

import { useEffect } from "react";
import { Card, Container, Group, List, SimpleGrid, Stack, Text, ThemeIcon, Title } from "@mantine/core";
import { IconAdjustmentsHorizontal, IconChartBar, IconSparkles, IconUpload } from "@tabler/icons-react";
import { NewSessionButton } from "@/components/NewSessionButton";
import { SessionCard } from "@/components/SessionCard";
import { useSessionStore } from "@/store/sessionStore";

export default function HomePage() {
  const sessions = useSessionStore((s) => s.sessions);
  const hydrated = useSessionStore((s) => s.hydrated);
  const hydrate = useSessionStore((s) => s.hydrate);
  const deleteSession = useSessionStore((s) => s.deleteSession);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  return (
    <Container size="md" py="xl">
      <Group justify="space-between" mb="xs">
        <Group gap="xs">
          <IconSparkles size={28} />
          <Title order={1}>Sorting Hat</Title>
        </Group>
        <NewSessionButton />
      </Group>

      <Text c="dimmed" mb="xl">
        Assign people to groups with two-sided stable matching — both sides rank their preferences, and the
        algorithm finds a matching where no person and group would rather ditch their assignments and pair up
        together instead.
      </Text>

      <Card withBorder radius="md" padding="lg" mb="xl">
        <Text fw={600} mb="sm">
          How it works
        </Text>
        <List spacing="sm" center>
          <List.Item
            icon={
              <ThemeIcon variant="light" size={28} radius="xl">
                <IconUpload size={16} />
              </ThemeIcon>
            }
          >
            Import two CSVs: people ranking the groups they&apos;d want, and groups ranking the people they&apos;d
            want (plus each group&apos;s capacity).
          </List.Item>
          <List.Item
            icon={
              <ThemeIcon variant="light" size={28} radius="xl">
                <IconAdjustmentsHorizontal size={16} />
              </ThemeIcon>
            }
          >
            Pick a matching method — stable (Gale-Shapley, guarantees no one could improve by defecting together)
            or optimal (minimizes everyone&apos;s average achieved rank) — and tune options like mutual-only
            pairing.
          </List.Item>
          <List.Item
            icon={
              <ThemeIcon variant="light" size={28} radius="xl">
                <IconChartBar size={16} />
              </ThemeIcon>
            }
          >
            Run the match and review assignments, happiness scores, stability, and alternatives, or export the
            results as a CSV.
          </List.Item>
        </List>
      </Card>

      {hydrated && sessions.length === 0 && (
        <Stack align="center" py="xl" gap="xs">
          <Text c="dimmed">No sessions yet.</Text>
          <NewSessionButton label="Create your first session" variant="light" />
        </Stack>
      )}

      <SimpleGrid cols={{ base: 1, sm: 2 }}>
        {sessions.map((session) => (
          <SessionCard key={session.id} session={session} onDelete={deleteSession} />
        ))}
      </SimpleGrid>
    </Container>
  );
}
