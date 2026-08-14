import "@mantine/core/styles.css";
import "@mantine/notifications/styles.css";
import "@mantine/dropzone/styles.css";
import "@mantine/charts/styles.css";
import "./globals.css";

import type { Metadata } from "next";
import { ColorSchemeScript, mantineHtmlProps, MantineProvider, Text } from "@mantine/core";
import { Notifications } from "@mantine/notifications";
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
          <Text component="footer" size="xs" c="dimmed" ta="center" py="md">
            No data is stored on a server — everything stays in your browser.
          </Text>
        </MantineProvider>
      </body>
    </html>
  );
}
