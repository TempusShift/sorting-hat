"use client";

import { Table, Text } from "@mantine/core";

interface PreviewTableProps {
  headers: string[];
  rows: (string | number)[][];
  maxRows?: number;
}

export function PreviewTable({ headers, rows, maxRows = 10 }: PreviewTableProps) {
  const visible = rows.slice(0, maxRows);

  return (
    <Table.ScrollContainer minWidth={300}>
      <Table striped highlightOnHover withTableBorder>
        <Table.Thead>
          <Table.Tr>
            {headers.map((h) => (
              <Table.Th key={h}>{h}</Table.Th>
            ))}
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {visible.map((row, i) => (
            <Table.Tr key={i}>
              {row.map((cell, j) => (
                <Table.Td key={j}>{cell}</Table.Td>
              ))}
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
      {rows.length > maxRows && (
        <Text size="xs" c="dimmed" mt={4}>
          Showing {maxRows} of {rows.length} rows
        </Text>
      )}
    </Table.ScrollContainer>
  );
}
