"use client";

import { useEffect, useState } from "react";
import { Slider } from "@mantine/core";
import { useDebouncedValue } from "@mantine/hooks";
import {
  DEFAULT_OPTIMAL_PRIORITY,
  OPTIMAL_PRIORITY_MAX,
  OPTIMAL_PRIORITY_MIN,
  priorityWeights,
} from "@/lib/algorithm";

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

/** Label for a priority step: the person:group weight ratio in lowest terms, e.g. "3:5". */
function stepLabel(step: number): string {
  if (step === OPTIMAL_PRIORITY_MIN) return "People only";
  if (step === OPTIMAL_PRIORITY_MAX) return "Groups only";
  if (step === DEFAULT_OPTIMAL_PRIORITY) return "Balanced";
  const { person, group } = priorityWeights(step);
  const divisor = gcd(person, group);
  return `${person / divisor}:${group / divisor}`;
}

const MARKS = Array.from({ length: OPTIMAL_PRIORITY_MAX - OPTIMAL_PRIORITY_MIN + 1 }, (_, i) => {
  const value = OPTIMAL_PRIORITY_MIN + i;
  return { value, label: stepLabel(value) };
});

interface OptimalPrioritySliderProps {
  value: number | undefined;
  onChange: (step: number) => void;
  /** Fired on every drag tick that differs from the committed value, before the debounce settles — e.g. to start a loading indicator early. */
  onDraftChange?: () => void;
  /** Fired once the debounce settles without a net change (dragged back to the committed value) — e.g. to clear a loading indicator started by `onDraftChange`. */
  onSettle?: () => void;
  /** Checks whether a step's result is already cached — if so it's applied immediately, skipping the debounce, since there's no recompute to guard against. */
  isStepCached?: (step: number) => boolean;
  debounceMs?: number;
}

/**
 * Debounced 17-step slider for optimal-solve priority (0 = people only .. 16 = groups only).
 * Render with `key={sessionId}` (or similar) so it resets cleanly when switching sessions.
 */
export function OptimalPrioritySlider({
  value,
  onChange,
  onDraftChange,
  onSettle,
  isStepCached,
  debounceMs = 1000,
}: OptimalPrioritySliderProps) {
  const [draft, setDraft] = useState(value ?? DEFAULT_OPTIMAL_PRIORITY);
  const [debounced] = useDebouncedValue(draft, debounceMs);

  useEffect(() => {
    if (debounced !== (value ?? DEFAULT_OPTIMAL_PRIORITY)) {
      onChange(debounced);
    } else {
      onSettle?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);

  return (
    <Slider
      min={OPTIMAL_PRIORITY_MIN}
      max={OPTIMAL_PRIORITY_MAX}
      step={1}
      value={draft}
      onChange={(step) => {
        setDraft(step);
        if (step === (value ?? DEFAULT_OPTIMAL_PRIORITY)) return;
        if (isStepCached?.(step)) {
          onChange(step);
        } else {
          onDraftChange?.();
        }
      }}
      marks={MARKS}
      label={stepLabel}
      mb="lg"
    />
  );
}
