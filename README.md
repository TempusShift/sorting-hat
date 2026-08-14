# Sorting Hat

A local-first web app that assigns people to groups using two-sided stable matching (Gale–Shapley) — for
scenarios like team drafts, project placements, or rotational assignments, where both sides rank their
preferences and you want a fair, stable outcome. All data lives in your browser's `localStorage`; there's no
backend and no accounts.

## How it works

1. **Import two CSVs** — one with people ranking the groups they'd want, one with groups ranking the people
   they'd want (plus each group's capacity).
2. **Pick a matching method** — stable (Gale-Shapley: no person and group would rather ditch their assignments
   and pair up together instead) or optimal (minimizes everyone's average achieved rank). Optional toggles let
   you require mutual preference, try to seat everyone who can be seated, and guarantee every group gets at
   least one person.
3. **Run the match** and review assignments, happiness scores, group fill rates, stability analysis, and
   per-person alternatives — or export the results as a CSV.

## CSV formats

**People rankings**
```
name,rank1,rank2,rank3,...
Alice,Engineering,Design,Marketing
Bob,Design,Marketing,Engineering
```
First column is the person's name; the rest are group names in preference order.

**Groups rankings**
```
name,capacity,rank1,rank2,...
Engineering,5,Alice,Carol,Bob
Design,3,Bob,Alice
```
`name` is the group name, `capacity` is the max number of people it can take, and the rest are person names in
preference order. Ranking columns are optional — a group with none is treated as indifferent (accepts anyone,
by arrival order).

Both CSVs can be uploaded as files or pasted directly in the setup wizard.

## Getting started

Requires Node (see `.nvmrc`) and [pnpm](https://pnpm.io).

```bash
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

## Testing

```bash
pnpm test        # run once
pnpm test:watch  # watch mode
```

## Running with Docker

```bash
docker compose up --build
```

Serves the app on [http://localhost:3026](http://localhost:3026).

## Tech stack

Next.js (App Router, TypeScript), Mantine UI, Zustand for state, `papaparse` for CSV parsing, Vitest for
testing.
