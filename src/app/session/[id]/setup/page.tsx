"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  Alert,
  Box,
  Button,
  Container,
  Group,
  List,
  Loader,
  SegmentedControl,
  SimpleGrid,
  Stack,
  Stepper,
  Switch,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { IconAlertTriangle, IconArrowLeft, IconArrowRight, IconSparkles } from "@tabler/icons-react";
import { CsvDropzone } from "@/components/CsvDropzone";
import { NewSessionButton } from "@/components/NewSessionButton";
import { PreviewTable } from "@/components/PreviewTable";
import {
  buildSessionEntities,
  parseGroupsCsv,
  parsePeopleCsv,
  type ParsedGroupRow,
  type ParsedPersonRow,
} from "@/lib/csv";
import type { Group as GroupEntity, Person } from "@/lib/types";
import { useSessionStore } from "@/store/sessionStore";

const PEOPLE_CSV_EXAMPLE = `name,rank1,rank2,rank3
Alice,Engineering,Design,Marketing
Bob,Design,Marketing,Engineering`;

const GROUPS_CSV_EXAMPLE = `name,capacity,rank1,rank2
Engineering,5,Alice,Carol,Bob
Design,3,Bob,Alice`;

export default function SetupPage() {
  const params = useParams<{ id: string }>();
  const sessionId = params.id;
  const router = useRouter();

  const hydrate = useSessionStore((s) => s.hydrate);
  const hydrated = useSessionStore((s) => s.hydrated);
  const session = useSessionStore((s) => s.sessions.find((sess) => sess.id === sessionId));
  const renameSession = useSessionStore((s) => s.renameSession);
  const setPeopleAndGroups = useSessionStore((s) => s.setPeopleAndGroups);
  const setFillUnmatched = useSessionStore((s) => s.setFillUnmatched);
  const setMatchingMethod = useSessionStore((s) => s.setMatchingMethod);
  const runMatching = useSessionStore((s) => s.runMatching);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [nameInitializedForId, setNameInitializedForId] = useState<string | null>(null);

  const [personFileName, setPersonFileName] = useState<string | null>(null);
  const [personRows, setPersonRows] = useState<ParsedPersonRow[]>([]);
  const [personErrors, setPersonErrors] = useState<string[]>([]);

  const [groupFileName, setGroupFileName] = useState<string | null>(null);
  const [groupRows, setGroupRows] = useState<ParsedGroupRow[]>([]);
  const [groupErrors, setGroupErrors] = useState<string[]>([]);

  if (session && nameInitializedForId !== session.id) {
    setName(session.name);
    setNameInitializedForId(session.id);
  }

  function handlePeopleFile(text: string, fileName: string) {
    const { rows, errors } = parsePeopleCsv(text);
    setPersonRows(rows);
    setPersonErrors(errors);
    setPersonFileName(fileName);
  }

  function handleGroupsFile(text: string, fileName: string) {
    const { rows, errors } = parseGroupsCsv(text);
    setGroupRows(rows);
    setGroupErrors(errors);
    setGroupFileName(fileName);
  }

  const imported = useMemo(() => {
    if (personRows.length === 0 && groupRows.length === 0) return null;
    return buildSessionEntities(personRows, groupRows);
  }, [personRows, groupRows]);

  const reviewPeople: Person[] = imported?.people ?? session?.people ?? [];
  const reviewGroups: GroupEntity[] = imported?.groups ?? session?.groups ?? [];
  const warnings = imported?.warnings ?? [];

  const groupNameById = new Map(reviewGroups.map((g) => [g.id, g.name]));
  const personNameById = new Map(reviewPeople.map((p) => [p.id, p.name]));

  function handleNameNext() {
    if (name.trim()) {
      renameSession(sessionId, name.trim());
    }
    setStep(1);
  }

  function handleRunMatching() {
    if (imported) {
      setPeopleAndGroups(sessionId, imported.people, imported.groups);
    }
    runMatching(sessionId);
    router.push(`/session/${sessionId}/results`);
  }

  if (!hydrated) {
    return (
      <Container size="md" py="xl">
        <Loader />
      </Container>
    );
  }

  if (!session) {
    return (
      <Container size="md" py="xl">
        <Alert color="red" title="Session not found">
          This session doesn&apos;t exist.{" "}
          <Text component={Link} href="/" td="underline">
            Go back home
          </Text>
        </Alert>
      </Container>
    );
  }

  const canProceedFromImport = reviewPeople.length > 0 && reviewGroups.length > 0;
  const canRun = reviewPeople.length > 0 && reviewGroups.length > 0;

  return (
    <Container size="md" py="xl">
      <Group justify="space-between" mb="xl">
        <Group gap="xs">
          <IconSparkles size={24} />
          <Title order={2}>Set up: {session.name}</Title>
        </Group>
        <NewSessionButton variant="default" />
      </Group>

      <Stepper active={step} onStepClick={setStep} mb="xl">
        <Stepper.Step label="Name" description="Name your session">
          <Stack maw={420} mt="lg">
            <TextInput
              label="Session name"
              value={name}
              onChange={(e) => setName(e.currentTarget.value)}
              data-autofocus
            />
          </Stack>
        </Stepper.Step>

        <Stepper.Step label="Import" description="Upload CSVs">
          <Stack mt="lg">
            <SimpleGrid cols={{ base: 1, sm: 2 }}>
              <CsvDropzone
                label="People rankings"
                description="name, then ranked group names"
                fileName={personFileName}
                formatExample={PEOPLE_CSV_EXAMPLE}
                onTextLoaded={handlePeopleFile}
              />
              <CsvDropzone
                label="Groups rankings"
                description="name, capacity, then ranked person names (optional)"
                fileName={groupFileName}
                formatExample={GROUPS_CSV_EXAMPLE}
                onTextLoaded={handleGroupsFile}
              />
            </SimpleGrid>

            {personErrors.length > 0 && (
              <Alert color="red" title="People CSV issues" icon={<IconAlertTriangle size={16} />}>
                <List size="sm">
                  {personErrors.map((e, i) => (
                    <List.Item key={i}>{e}</List.Item>
                  ))}
                </List>
              </Alert>
            )}
            {groupErrors.length > 0 && (
              <Alert color="red" title="Groups CSV issues" icon={<IconAlertTriangle size={16} />}>
                <List size="sm">
                  {groupErrors.map((e, i) => (
                    <List.Item key={i}>{e}</List.Item>
                  ))}
                </List>
              </Alert>
            )}
            {warnings.length > 0 && (
              <Alert color="yellow" title="Warnings" icon={<IconAlertTriangle size={16} />}>
                <List size="sm">
                  {warnings.map((w, i) => (
                    <List.Item key={i}>{w}</List.Item>
                  ))}
                </List>
              </Alert>
            )}

            {personRows.length > 0 && (
              <Box>
                <Text size="sm" fw={500} mb={4}>
                  People preview ({personRows.length})
                </Text>
                <PreviewTable
                  headers={["Name", "Rankings"]}
                  rows={personRows.map((r) => [r.name, r.rankingNames.join(", ")])}
                />
              </Box>
            )}
            {groupRows.length > 0 && (
              <Box>
                <Text size="sm" fw={500} mb={4}>
                  Groups preview ({groupRows.length})
                </Text>
                <PreviewTable
                  headers={["Name", "Capacity", "Rankings"]}
                  rows={groupRows.map((r) => [r.name, r.capacity, r.rankingNames.join(", ")])}
                />
              </Box>
            )}

            {session.people.length > 0 && personRows.length === 0 && (
              <Text size="sm" c="dimmed">
                This session already has {session.people.length} people and {session.groups.length} groups saved.
                Upload new CSVs to replace them, or continue to review the existing data.
              </Text>
            )}
          </Stack>
        </Stepper.Step>

        <Stepper.Step label="Review" description="Confirm and run">
          <Stack mt="lg">
            <Box>
              <Text size="sm" fw={500} mb={4}>
                Matching method
              </Text>
              <SegmentedControl
                value={session.matchingMethod ?? "stable"}
                onChange={(v) => setMatchingMethod(sessionId, v as "stable" | "optimal")}
                data={[
                  { label: "Stable (Gale-Shapley)", value: "stable" },
                  { label: "Optimal (lowest mean rank)", value: "optimal" },
                ]}
              />
              <Text size="xs" c="dimmed" mt={4}>
                {(session.matchingMethod ?? "stable") === "stable"
                  ? "Balances both sides' preferences into a matching neither a person nor a group could improve on by defecting together."
                  : "Ignores group preferences entirely and finds the assignment with the lowest possible average rank achieved, matching as many people as possible first."}
              </Text>
            </Box>
            {(session.matchingMethod ?? "stable") === "stable" && (
              <Switch
                label="Avoid leaving anyone unmatched when capacity allows"
                description="If someone's ranked groups are full, try shifting other people to a different group they also ranked to free up a seat — never into a group nobody ranked"
                checked={session.fillUnmatched ?? false}
                onChange={(e) => setFillUnmatched(sessionId, e.currentTarget.checked)}
              />
            )}
            <Box>
              <Text size="sm" fw={500} mb={4}>
                People ({reviewPeople.length})
              </Text>
              <PreviewTable
                headers={["Name", "Ranked groups"]}
                rows={reviewPeople.map((p) => [
                  p.name,
                  p.rankings.length > 0
                    ? p.rankings.map((id) => groupNameById.get(id) ?? "?").join(" > ")
                    : "(indifferent)",
                ])}
              />
            </Box>
            <Box>
              <Text size="sm" fw={500} mb={4}>
                Groups ({reviewGroups.length})
              </Text>
              <PreviewTable
                headers={["Name", "Capacity", "Ranked people"]}
                rows={reviewGroups.map((g) => [
                  g.name,
                  g.capacity,
                  g.rankings.length > 0
                    ? g.rankings.map((id) => personNameById.get(id) ?? "?").join(" > ")
                    : "(indifferent)",
                ])}
              />
            </Box>
          </Stack>
        </Stepper.Step>
      </Stepper>

      <Group justify="space-between">
        <Button
          variant="default"
          leftSection={<IconArrowLeft size={16} />}
          disabled={step === 0}
          onClick={() => setStep((s) => s - 1)}
        >
          Back
        </Button>

        {step === 0 && (
          <Button rightSection={<IconArrowRight size={16} />} onClick={handleNameNext}>
            Next
          </Button>
        )}
        {step === 1 && (
          <Button
            rightSection={<IconArrowRight size={16} />}
            disabled={!canProceedFromImport}
            onClick={() => setStep(2)}
          >
            Next
          </Button>
        )}
        {step === 2 && (
          <Button disabled={!canRun} onClick={handleRunMatching}>
            Run matching
          </Button>
        )}
      </Group>
    </Container>
  );
}
