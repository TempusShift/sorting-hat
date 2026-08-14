"use client";

import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { Center, Group, Table, UnstyledButton } from "@mantine/core";
import { IconChevronDown, IconChevronUp, IconSelector } from "@tabler/icons-react";

export type SortDirection = "asc" | "desc";

export function SortableHeader<K extends string>({
  label,
  sortKey,
  currentSort,
  currentDirection,
  onSort,
}: {
  label: ReactNode;
  sortKey: K;
  currentSort: K | null;
  currentDirection: SortDirection;
  onSort: (key: K) => void;
}) {
  const isActive = currentSort === sortKey;
  const Icon = isActive
    ? currentDirection === "asc"
      ? IconChevronUp
      : IconChevronDown
    : IconSelector;
  return (
    <Table.Th>
      <UnstyledButton onClick={() => onSort(sortKey)}>
        <Group gap={4} wrap="nowrap">
          <span>{label}</span>
          <Center>
            <Icon size={14} stroke={1.5} />
          </Center>
        </Group>
      </UnstyledButton>
    </Table.Th>
  );
}

/**
 * Shared search + click-to-sort state for a results table: filters `rows` by
 * `matches`, then sorts by whichever `sorters` entry is active. Rows keep their
 * incoming order when nothing is selected.
 */
export function useSearchSort<T, K extends string>(
  rows: T[],
  matches: (row: T, query: string) => boolean,
  sorters: Record<K, (a: T, b: T) => number>,
) {
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<K | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");

  const sortedRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    const filtered = query ? rows.filter((row) => matches(row, query)) : rows;
    if (!sortKey) return filtered;
    const dir = sortDirection === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => sorters[sortKey](a, b) * dir);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, search, sortKey, sortDirection]);

  function handleSort(key: K) {
    if (sortKey === key) {
      setSortDirection((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDirection("asc");
    }
  }

  return { search, setSearch, sortKey, sortDirection, handleSort, rows: sortedRows };
}
