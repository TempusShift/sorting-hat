"use client";

import { useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  ActionIcon,
  Alert,
  Box,
  Button,
  Container,
  Group,
  Loader,
  SegmentedControl,
  Stack,
  Switch,
  Tabs,
  Text,
  Title,
} from "@mantine/core";
import {
  IconArrowsDiff,
  IconArrowsShuffle,
  IconDownload,
  IconEdit,
  IconGitCompare,
  IconHome,
  IconListDetails,
  IconChartBar,
  IconShieldCheck,
} from "@tabler/icons-react";
import { AlternativesPanel } from "@/components/AlternativesPanel";
import { AssignmentsTable } from "@/components/AssignmentsTable";
import { CompareMethodsPanel } from "@/components/CompareMethodsPanel";
import { NewSessionButton } from "@/components/NewSessionButton";
import { StabilityPanel } from "@/components/StabilityPanel";
import { StatsPanel } from "@/components/StatsPanel";
import { exportAssignmentsCsv } from "@/lib/csv";
import { useSessionStore } from "@/store/sessionStore";

export default function ResultsPage() {
  const params = useParams<{ id: string }>();
  const sessionId = params.id;

  const hydrate = useSessionStore((s) => s.hydrate);
  const hydrated = useSessionStore((s) => s.hydrated);
  const session = useSessionStore((s) => s.sessions.find((sess) => sess.id === sessionId));
  const runMatching = useSessionStore((s) => s.runMatching);
  const setFillUnmatched = useSessionStore((s) => s.setFillUnmatched);
  const setMatchingMethod = useSessionStore((s) => s.setMatchingMethod);
  const setOptimalPriority = useSessionStore((s) => s.setOptimalPriority);
  const setMutualOnly = useSessionStore((s) => s.setMutualOnly);
  const setFillGroups = useSessionStore((s) => s.setFillGroups);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  if (!hydrated) {
    return (
      <Container size="lg" py="xl">
        <Loader />
      </Container>
    );
  }

  if (!session) {
    return (
      <Container size="lg" py="xl">
        <Alert color="red" title="Session not found">
          This session doesn&apos;t exist.{" "}
          <Text component={Link} href="/" td="underline">
            Go back home
          </Text>
        </Alert>
      </Container>
    );
  }

  if (!session.result) {
    return (
      <Container size="lg" py="xl">
        <Alert color="yellow" title="No results yet">
          This session hasn&apos;t been matched yet.{" "}
          <Text component={Link} href={`/session/${sessionId}/setup`} td="underline">
            Go to setup
          </Text>
        </Alert>
      </Container>
    );
  }

  const { people, groups, result, name: sessionName } = session;

  function handleExport() {
    if (!result) return;
    const csv = exportAssignmentsCsv(people, groups, result.assignments);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${sessionName.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-assignments.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return (
    <Container size="lg" py="xl">
      <Group justify="space-between" mb="md" wrap="wrap">
        <Group gap="xs">
          <ActionIcon component={Link} href="/" variant="default" size="lg" aria-label="Home">
            <IconHome size={18} />
          </ActionIcon>
          <Title order={2}>{session.name}</Title>
        </Group>
        <Group gap="xs">
          <Button
            variant="default"
            leftSection={<IconEdit size={16} />}
            component={Link}
            href={`/session/${sessionId}/setup`}
          >
            Edit session
          </Button>
          <Button leftSection={<IconArrowsShuffle size={16} />} onClick={() => runMatching(sessionId)}>
            Re-run
          </Button>
          <NewSessionButton variant="default" />
        </Group>
      </Group>

      <Box mb="xl">
        <Text size="sm" fw={500} mb={4}>
          Matching method
        </Text>
        <SegmentedControl
          value={session.matchingMethod ?? "stable"}
          onChange={(v) => {
            setMatchingMethod(sessionId, v as "stable" | "optimal");
            runMatching(sessionId);
          }}
          data={[
            { label: "Stable (Gale-Shapley)", value: "stable" },
            { label: "Optimal (lowest mean rank)", value: "optimal" },
          ]}
        />
        {(session.matchingMethod ?? "stable") === "stable" && (
          <Switch
            mt="sm"
            label="Avoid leaving anyone unmatched when capacity allows"
            description="Shifts other people between groups they ranked to free up a seat — never into a group nobody ranked"
            checked={session.fillUnmatched ?? false}
            onChange={(e) => {
              setFillUnmatched(sessionId, e.currentTarget.checked);
              runMatching(sessionId);
            }}
          />
        )}
        {(session.matchingMethod ?? "stable") === "optimal" && (
          <Box mt="sm">
            <Text size="sm" fw={500} mb={4}>
              Priority
            </Text>
            <SegmentedControl
              value={session.optimalPriority ?? "people"}
              onChange={(v) => {
                setOptimalPriority(sessionId, v as "people" | "balanced" | "groups");
                runMatching(sessionId);
              }}
              data={[
                { label: "People", value: "people" },
                { label: "Balanced", value: "balanced" },
                { label: "Groups", value: "groups" },
              ]}
            />
          </Box>
        )}
        <Switch
          mt="sm"
          label="Only pair if both sides ranked each other"
          description="A person and group can only be matched if each one listed the other (sides that gave no preferences at all are indifferent and still match anyone)"
          checked={session.mutualOnly ?? false}
          onChange={(e) => {
            setMutualOnly(sessionId, e.currentTarget.checked);
            runMatching(sessionId);
          }}
        />
        <Switch
          mt="sm"
          label="Make sure every group fills its spots"
          description="Force-fill any seats still open after matching with remaining unmatched people, even if neither side ranked the other"
          checked={session.fillGroups ?? false}
          onChange={(e) => {
            setFillGroups(sessionId, e.currentTarget.checked);
            runMatching(sessionId);
          }}
        />
      </Box>

      <Tabs defaultValue="assignments">
        <Tabs.List mb="md">
          <Tabs.Tab value="assignments" leftSection={<IconListDetails size={16} />}>
            Assignments
          </Tabs.Tab>
          <Tabs.Tab value="stats" leftSection={<IconChartBar size={16} />}>
            Stats
          </Tabs.Tab>
          <Tabs.Tab value="stability" leftSection={<IconShieldCheck size={16} />}>
            Stability
          </Tabs.Tab>
          <Tabs.Tab value="alternatives" leftSection={<IconGitCompare size={16} />}>
            Alternatives
          </Tabs.Tab>
          <Tabs.Tab value="compare" leftSection={<IconArrowsDiff size={16} />}>
            Compare methods
          </Tabs.Tab>
          <Tabs.Tab value="export" leftSection={<IconDownload size={16} />}>
            Export
          </Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="assignments">
          <AssignmentsTable
            people={people}
            groups={groups}
            assignments={result.assignments}
            bumpedPersonIds={result.bumpedPersonIds}
            backfilledPersonIds={result.backfilledPersonIds}
            forcedPersonIds={result.forcedPersonIds}
          />
        </Tabs.Panel>

        <Tabs.Panel value="stats">
          <StatsPanel
            people={people}
            groups={groups}
            assignments={result.assignments}
            bumpedPersonIds={result.bumpedPersonIds}
            backfilledPersonIds={result.backfilledPersonIds}
            forcedPersonIds={result.forcedPersonIds}
          />
        </Tabs.Panel>

        <Tabs.Panel value="stability">
          <StabilityPanel people={people} groups={groups} assignments={result.assignments} />
        </Tabs.Panel>

        <Tabs.Panel value="alternatives">
          <AlternativesPanel
            people={people}
            groups={groups}
            assignments={result.assignments}
            fillUnmatched={session.fillUnmatched}
            matchingMethod={session.matchingMethod}
            optimalPriority={session.optimalPriority}
            mutualOnly={session.mutualOnly}
            fillGroups={session.fillGroups}
          />
        </Tabs.Panel>

        <Tabs.Panel value="compare">
          <CompareMethodsPanel
            people={people}
            groups={groups}
            fillUnmatched={session.fillUnmatched}
            optimalPriority={session.optimalPriority}
            mutualOnly={session.mutualOnly}
            fillGroups={session.fillGroups}
          />
        </Tabs.Panel>

        <Tabs.Panel value="export">
          <Stack align="flex-start">
            <Text size="sm" c="dimmed">
              Download the assignments as a CSV with each person&apos;s name, assigned group, and rank achieved.
            </Text>
            <Button leftSection={<IconDownload size={16} />} onClick={handleExport}>
              Download CSV
            </Button>
          </Stack>
        </Tabs.Panel>
      </Tabs>
    </Container>
  );
}
