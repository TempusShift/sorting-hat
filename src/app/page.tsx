"use client";

import { useEffect } from "react";
import { Container, Group, SimpleGrid, Stack, Text, Title } from "@mantine/core";
import { IconSparkles } from "@tabler/icons-react";
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
      <Group justify="space-between" mb="xl">
        <Group gap="xs">
          <IconSparkles size={28} />
          <Title order={1}>Sorting Hat</Title>
        </Group>
        <NewSessionButton />
      </Group>

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
