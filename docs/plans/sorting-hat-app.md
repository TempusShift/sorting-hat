# Sorting Hat — App Plan

## Overview

A local-first Next.js (App Router, TypeScript) web app using Mantine UI that assigns people to groups via a two-sided stable matching algorithm (Gale-Shapley). All state lives in `localStorage`. No backend, no auth.

---

## Tech Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 15, App Router, TypeScript |
| UI | Mantine v7 + `@tabler/icons-react` |
| Algorithm | Gale-Shapley (person-proposing) |
| State / Persistence | Zustand + localStorage |
| CSV parsing | `papaparse` |
| Testing | Vitest + React Testing Library |

---

## Data Model

```ts
interface Session {
  id: string;            // uuid
  name: string;
  createdAt: string;     // ISO
  updatedAt: string;
  people: Person[];
  groups: Group[];
  result: MatchResult | null;
}

interface Person {
  id: string;
  name: string;
  rankings: string[];    // group ids, preference order (index 0 = most preferred)
}

interface Group {
  id: string;
  name: string;
  capacity: number;
  rankings: string[];    // person ids, preference order (optional — empty = no group preference)
}

interface MatchResult {
  assignments: Assignment[];  // one per person
  runAt: string;
}

interface Assignment {
  personId: string;
  groupId: string | null;     // null = unmatched
}
```

---

## CSV Formats

### People rankings CSV
```
name,rank1,rank2,rank3,...
Alice,Engineering,Design,Marketing
Bob,Design,Marketing,Engineering
```
- First column: person name
- Remaining columns: group names in preference order

### Groups rankings CSV
```
name,capacity,rank1,rank2,...
Engineering,5,Alice,Carol,Bob
Design,3,Bob,Alice
```
- `name`: group name
- `capacity`: integer max capacity
- Remaining columns: person names in preference order (optional)

If groups CSV omits ranking columns, groups are treated as indifferent (accept any, by arrival order).

---

## App Routes

```
/                          → Home: list sessions, create new
/session/[id]/setup        → 3-step wizard: name session, import CSVs, review & confirm
/session/[id]/results      → Run matching, view assignments, stats, alternatives
```

---

## Algorithm — Gale-Shapley (Extended for Capacities)

Standard person-proposing GS extended for group capacities (hospital-resident variant):

1. Each unmatched person proposes to their next most-preferred group.
2. A group tentatively accepts up to `capacity` proposals, rejecting the least-preferred if over capacity.
3. Repeat until no proposals remain.

Result is **person-optimal** stable matching.

If groups have no preferences (`rankings` is empty), they accept proposals in arrival order (FIFO).

---

## Results & Stats

| Metric | Description |
|---|---|
| **Happiness score** | For each person: 1-indexed rank of their assigned group (lower = better). Summary: mean, median, distribution chart. |
| **Group fill rate** | Assigned / capacity per group |
| **Unmatched** | People with no assignment; groups with open slots |
| **Stability analysis** | Find all blocking pairs: (person p, group g) where p prefers g over their match AND g prefers p over one of its members (or has an open slot) |
| **Alternatives** | For each person: the next group they would have gone to if their assigned group were removed — using a re-run with that group excluded |
| **CSV export** | Download assignments as `name,group,rank_achieved` |

---

## Page Breakdown

### `/` — Session List
- List of saved sessions (from localStorage), sorted by `updatedAt`
- "New session" button → `/session/[new-uuid]/setup`
- Each session card: name, date, person/group counts, delete button

### `/session/[id]/setup` — Setup Wizard

**Step 1 — Name**
- Session name input

**Step 2 — Import CSVs**
- Two drop zones: "People rankings" and "Groups rankings"
- Preview table after parsing
- Validation: detect unknown group/person names in rankings, warn on missing names

**Step 3 — Review**
- Summary table of people + their ranked groups
- Summary table of groups + capacity + their ranked people
- "Run matching" button → saves session, runs algorithm, navigates to results

### `/session/[id]/results` — Results

Tabs:
1. **Assignments** — table: Person | Assigned Group | Rank Achieved
2. **Stats** — happiness score distribution (bar chart), group fill rates
3. **Stability** — list of blocking pairs (or "Matching is stable ✓")
4. **Alternatives** — per-person alternative group if reassigned
5. **Export** — download CSV button

"Re-run" button re-executes the algorithm (useful after editing a session).
"Edit session" link → back to setup.

---

## File Structure

```
src/
  app/
    page.tsx                        # session list
    session/
      [id]/
        setup/
          page.tsx
        results/
          page.tsx
  components/
    SessionCard.tsx
    CsvDropzone.tsx
    PreviewTable.tsx
    AssignmentsTable.tsx
    StatsPanel.tsx
    StabilityPanel.tsx
    AlternativesPanel.tsx
  lib/
    algorithm.ts                    # Gale-Shapley implementation
    csv.ts                          # CSV parse/export helpers
    storage.ts                      # localStorage read/write
    types.ts                        # shared TypeScript types
  store/
    sessionStore.ts                 # Zustand store
  __tests__/
    algorithm.test.ts
    csv.test.ts
    storage.test.ts
```

---

## Open Questions / Decisions

- Mantine charts (`@mantine/charts`) will be used for the happiness distribution bar chart.
- Zustand will be the state layer with a custom localStorage persistence middleware.
- `papaparse` handles all CSV parsing (handles quoted fields, whitespace trimming, etc.).
- No server actions or API routes needed — all computation is client-side.
