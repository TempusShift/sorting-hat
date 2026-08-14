"use client";

import { useState } from "react";
import { Dropzone, MIME_TYPES } from "@mantine/dropzone";
import { Button, Code, Group, SegmentedControl, Stack, Text, Textarea, ThemeIcon } from "@mantine/core";
import { IconCheck, IconUpload } from "@tabler/icons-react";

interface CsvDropzoneProps {
  label: string;
  description?: string;
  fileName: string | null;
  formatExample: string;
  onTextLoaded: (text: string, source: string) => void;
}

export function CsvDropzone({ label, description, fileName, formatExample, onTextLoaded }: CsvDropzoneProps) {
  const [mode, setMode] = useState<"file" | "paste">("file");
  const [loading, setLoading] = useState(false);
  const [pasteValue, setPasteValue] = useState("");

  function handleDrop(files: File[]) {
    const file = files[0];
    if (!file) return;
    setLoading(true);
    const reader = new FileReader();
    reader.onload = () => {
      onTextLoaded(String(reader.result ?? ""), file.name);
      setLoading(false);
    };
    reader.onerror = () => setLoading(false);
    reader.readAsText(file);
  }

  function handleUsePastedText() {
    if (!pasteValue.trim()) return;
    onTextLoaded(pasteValue, "Pasted text");
  }

  return (
    <Stack gap={4}>
      <Group justify="space-between" align="center">
        <Text fw={500} size="sm">
          {label}
        </Text>
        <SegmentedControl
          size="xs"
          value={mode}
          onChange={(v) => setMode(v as "file" | "paste")}
          data={[
            { label: "Upload file", value: "file" },
            { label: "Paste text", value: "paste" },
          ]}
        />
      </Group>

      {description && (
        <Text size="xs" c="dimmed">
          {description}
        </Text>
      )}

      {mode === "file" ? (
        <Dropzone onDrop={handleDrop} maxFiles={1} loading={loading} accept={[MIME_TYPES.csv, "text/plain"]}>
          <Group justify="center" gap="md" mih={100} style={{ pointerEvents: "none" }}>
            <ThemeIcon variant="light" size={40} color={fileName ? "green" : "gray"}>
              {fileName ? <IconCheck size={20} /> : <IconUpload size={20} />}
            </ThemeIcon>
            <Stack gap={0}>
              <Text size="sm" fw={500}>
                {fileName ?? "Drop CSV file here or click to browse"}
              </Text>
            </Stack>
          </Group>
        </Dropzone>
      ) : (
        <Stack gap="xs">
          <Textarea
            placeholder={formatExample}
            autosize
            minRows={5}
            maxRows={12}
            styles={{ input: { fontFamily: "var(--mantine-font-family-monospace)" } }}
            value={pasteValue}
            onChange={(e) => setPasteValue(e.currentTarget.value)}
          />
          <Group justify="space-between" align="center">
            {fileName ? (
              <Group gap={4}>
                <IconCheck size={14} color="var(--mantine-color-green-6)" />
                <Text size="xs" c="green">
                  Loaded: {fileName}
                </Text>
              </Group>
            ) : (
              <span />
            )}
            <Button size="xs" onClick={handleUsePastedText} disabled={!pasteValue.trim()}>
              Use this data
            </Button>
          </Group>
        </Stack>
      )}

      <Stack gap={2} mt={4}>
        <Text size="xs" fw={500} c="dimmed">
          Expected format
        </Text>
        <Code block>{formatExample}</Code>
      </Stack>
    </Stack>
  );
}
