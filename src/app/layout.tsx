import "@mantine/core/styles.css";
import "@mantine/notifications/styles.css";
import "@mantine/dropzone/styles.css";
import "@mantine/charts/styles.css";
import "./globals.css";

import type { Metadata } from "next";
import { Anchor, ColorSchemeScript, Group, mantineHtmlProps, MantineProvider, Stack, Text } from "@mantine/core";
import { Notifications } from "@mantine/notifications";
import { IconBrandGithub } from "@tabler/icons-react";
import { theme } from "./theme";

export const metadata: Metadata = {
  title: "Sorting Hat",
  description: "Assign people to groups via stable matching",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" {...mantineHtmlProps}>
      <head>
        <ColorSchemeScript defaultColorScheme="auto" />
      </head>
      <body>
        <MantineProvider theme={theme} defaultColorScheme="auto">
          <Notifications />
          {children}
          <Stack component="footer" gap={4} align="center" py="md">
            <Text size="xs" c="dimmed">
              No data is stored on a server — everything stays in your browser.
            </Text>
            <Anchor href="https://github.com/TempusShift/sorting-hat" target="_blank" rel="noopener noreferrer" size="xs" c="dimmed">
              <Group gap={4} wrap="nowrap">
                <IconBrandGithub size={14} />
                GitHub
              </Group>
            </Anchor>
          </Stack>
        </MantineProvider>
      </body>
    </html>
  );
}
