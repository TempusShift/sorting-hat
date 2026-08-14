"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Group, Modal, Stack, TextInput } from "@mantine/core";
import { IconPlus } from "@tabler/icons-react";
import { useSessionStore } from "@/store/sessionStore";

interface NewSessionButtonProps {
  label?: string;
  variant?: string;
}

export function NewSessionButton({ label = "New session", variant }: NewSessionButtonProps) {
  const router = useRouter();
  const createSession = useSessionStore((s) => s.createSession);

  const [opened, setOpened] = useState(false);
  const [name, setName] = useState("");

  function handleCreate() {
    const sessionName = name.trim() || "Untitled session";
    const session = createSession(sessionName);
    setOpened(false);
    setName("");
    router.push(`/session/${session.id}/setup`);
  }

  return (
    <>
      <Button variant={variant} leftSection={<IconPlus size={16} />} onClick={() => setOpened(true)}>
        {label}
      </Button>

      <Modal opened={opened} onClose={() => setOpened(false)} title="New session">
        <Stack>
          <TextInput
            label="Session name"
            placeholder="e.g. Fall retreat groups"
            value={name}
            onChange={(e) => setName(e.currentTarget.value)}
            onKeyDown={(e) => e.key === "Enter" && handleCreate()}
            data-autofocus
          />
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setOpened(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreate}>Create</Button>
          </Group>
        </Stack>
      </Modal>
    </>
  );
}
