import type { Assignment, Group, MatchResult, Person } from "./types";

export type MatchingMethod = "stable" | "optimal";

/**
 * Which side's preferences the optimal solve weights more heavily.
 * "people" (default) reproduces the original person-only behavior; "groups" mirrors
 * that but from the group side; "balanced" weights both equally.
 */
export type OptimalPriority = "people" | "balanced" | "groups";

const PRIORITY_WEIGHTS: Record<OptimalPriority, { person: number; group: number }> = {
  people: { person: 1, group: 0 },
  balanced: { person: 1, group: 1 },
  groups: { person: 0, group: 1 },
};

interface GaleShapleyOptions {
  /** Group ids to exclude from the run entirely (used for alternatives analysis). */
  excludeGroupIds?: string[];
  /**
   * After stable matching converges, try to place each still-unmatched person by
   * shifting other people between groups they themselves ranked (an augmenting-path
   * search), never into a group nobody in the chain actually ranked.
   */
  fillUnmatched?: boolean;
  /** Restrict pairing to sides that ranked each other (indifferent sides always qualify). */
  mutualOnly?: boolean;
  /** Force-fill any seats still open after matching (and fillUnmatched) with remaining unmatched people, regardless of preference — still subject to mutualOnly. */
  fillGroups?: boolean;
}

/** Whether a person and group are allowed to pair under mutualOnly: each side that stated any preferences must have included the other (indifferent sides always qualify). */
function isMutuallyEligible(person: Person, group: Group): boolean {
  const personOk = person.rankings.length === 0 || person.rankings.includes(group.id);
  const groupOk = group.rankings.length === 0 || group.rankings.includes(person.id);
  return personOk && groupOk;
}

/**
 * Group's preference rank for a person: lower is more preferred.
 * Unranked people are treated as least-preferred (still acceptable).
 * Only meaningful when the group expressed preferences at all.
 */
function groupPreferenceRank(group: Group, personId: string): number {
  const idx = group.rankings.indexOf(personId);
  return idx === -1 ? Number.POSITIVE_INFINITY : idx;
}

/**
 * Group's preference cost for a person, bounded (unlike groupPreferenceRank) so it can
 * be summed in the optimal solve: indifferent groups cost nothing, and someone the
 * group didn't list costs as much as its least-preferred listed member.
 */
function groupPreferenceCost(group: Group, personId: string): number {
  if (group.rankings.length === 0) return 0;
  const idx = group.rankings.indexOf(personId);
  return idx === -1 ? group.rankings.length : idx;
}

/**
 * Person-proposing Gale-Shapley, extended to group capacities (hospital-resident variant).
 * Groups with no stated preferences accept proposals FIFO up to capacity and never evict.
 * People with no stated preferences are willing to propose to any group, in group list
 * order, mirroring that same indifference.
 * Produces a person-optimal stable matching.
 */
export function runGaleShapley(
  people: Person[],
  groups: Group[],
  options: GaleShapleyOptions = {},
): MatchResult {
  const exclude = new Set(options.excludeGroupIds ?? []);
  const groupMap = new Map(groups.map((g) => [g.id, g]));
  const allGroupIds = groups.map((g) => g.id);
  const effectiveRankings = new Map<string, string[]>(
    people.map((p) => {
      const base = p.rankings.length > 0 ? p.rankings : allGroupIds;
      const filtered = options.mutualOnly
        ? base.filter((groupId) => {
            const group = groupMap.get(groupId);
            return group !== undefined && isMutuallyEligible(p, group);
          })
        : base;
      return [p.id, filtered];
    }),
  );

  const tentative = new Map<string, string[]>(groups.map((g) => [g.id, []]));
  const nextIndex = new Map<string, number>(people.map((p) => [p.id, 0]));
  const matchedGroup = new Map<string, string | null>(people.map((p) => [p.id, null]));
  const bumped = new Set<string>();

  const queue: string[] = people.map((p) => p.id);

  while (queue.length > 0) {
    const personId = queue.shift()!;
    const rankings = effectiveRankings.get(personId)!;
    let idx = nextIndex.get(personId)!;
    let proposed = false;

    while (!proposed && idx < rankings.length) {
      const groupId = rankings[idx];
      idx++;
      if (exclude.has(groupId)) continue;
      const group = groupMap.get(groupId);
      if (!group) continue;

      const members = tentative.get(groupId)!;
      if (members.length < group.capacity) {
        members.push(personId);
        matchedGroup.set(personId, groupId);
        proposed = true;
      } else if (members.length > 0 && group.rankings.length > 0) {
        let worstMemberId = members[0];
        let worstRank = groupPreferenceRank(group, worstMemberId);
        for (const memberId of members) {
          const rank = groupPreferenceRank(group, memberId);
          if (rank > worstRank) {
            worstRank = rank;
            worstMemberId = memberId;
          }
        }
        const candidateRank = groupPreferenceRank(group, personId);
        if (candidateRank < worstRank) {
          const pos = members.indexOf(worstMemberId);
          members.splice(pos, 1, personId);
          matchedGroup.set(personId, groupId);
          matchedGroup.set(worstMemberId, null);
          bumped.add(worstMemberId);
          queue.push(worstMemberId);
          proposed = true;
        }
      }
    }

    nextIndex.set(personId, idx);
  }

  const shifted = new Set<string>();
  const backfilled = new Set<string>();
  if (options.fillUnmatched) {
    // Augmenting-path search (Kuhn's algorithm, capacitated): try to seat each
    // unmatched person by moving already-matched people to another group *they*
    // ranked, freeing the slot the unmatched person wants. Never touches a group
    // outside the mover's own ranked list.
    const tryPlace = (personId: string, visitedGroups: Set<string>): boolean => {
      for (const groupId of effectiveRankings.get(personId)!) {
        if (exclude.has(groupId) || visitedGroups.has(groupId)) continue;
        visitedGroups.add(groupId);
        const group = groupMap.get(groupId);
        if (!group) continue;

        const members = tentative.get(groupId)!;
        if (members.length < group.capacity) {
          members.push(personId);
          matchedGroup.set(personId, groupId);
          return true;
        }
        for (const memberId of [...members]) {
          if (tryPlace(memberId, visitedGroups)) {
            members.splice(members.indexOf(memberId), 1);
            members.push(personId);
            matchedGroup.set(personId, groupId);
            shifted.add(memberId);
            return true;
          }
        }
      }
      return false;
    };

    for (const p of people) {
      if (matchedGroup.get(p.id) !== null) continue;
      if (tryPlace(p.id, new Set())) backfilled.add(p.id);
    }
  }

  const forced = new Set<string>();
  if (options.fillGroups) {
    // Last resort: seats still open at this point can't belong to any remaining
    // unmatched person's own ranked list (GS never turns away an open seat), so the
    // only way to fill them is to pair outside stated preference entirely.
    for (const group of groups) {
      if (exclude.has(group.id)) continue;
      const members = tentative.get(group.id)!;
      if (members.length >= group.capacity) continue;
      for (const p of people) {
        if (members.length >= group.capacity) break;
        if (matchedGroup.get(p.id) !== null) continue;
        if (options.mutualOnly && !isMutuallyEligible(p, group)) continue;
        members.push(p.id);
        matchedGroup.set(p.id, group.id);
        forced.add(p.id);
      }
    }
  }

  const assignments: Assignment[] = people.map((p) => ({
    personId: p.id,
    groupId: matchedGroup.get(p.id) ?? null,
  }));

  return {
    assignments,
    runAt: new Date().toISOString(),
    bumpedPersonIds: [...bumped],
    shiftedPersonIds: [...shifted],
    backfilledPersonIds: [...backfilled],
    forcedPersonIds: [...forced],
  };
}

interface FlowEdge {
  to: number;
  cap: number;
  cost: number;
  rev: number;
}

/**
 * Minimal min-cost max-flow (successive shortest augmenting paths via SPFA).
 * Running to completion yields the minimum-cost solution among all maximum-flow
 * solutions — exactly "match as many as possible, then minimize total cost."
 */
class MinCostFlow {
  private graph: FlowEdge[][];

  constructor(nodeCount: number) {
    this.graph = Array.from({ length: nodeCount }, () => []);
  }

  addEdge(from: number, to: number, cap: number, cost: number): number {
    const idx = this.graph[from].length;
    this.graph[from].push({ to, cap, cost, rev: this.graph[to].length });
    this.graph[to].push({ to: from, cap: 0, cost: -cost, rev: idx });
    return idx;
  }

  remainingCap(node: number, edgeIdx: number): number {
    return this.graph[node][edgeIdx].cap;
  }

  run(source: number, sink: number): void {
    const n = this.graph.length;
    for (;;) {
      const dist = new Array<number>(n).fill(Number.POSITIVE_INFINITY);
      const inQueue = new Array<boolean>(n).fill(false);
      const prevNode = new Array<number>(n).fill(-1);
      const prevEdge = new Array<number>(n).fill(-1);
      dist[source] = 0;
      const queue = [source];
      inQueue[source] = true;
      while (queue.length > 0) {
        const u = queue.shift()!;
        inQueue[u] = false;
        this.graph[u].forEach((e, i) => {
          if (e.cap > 0 && dist[u] + e.cost < dist[e.to]) {
            dist[e.to] = dist[u] + e.cost;
            prevNode[e.to] = u;
            prevEdge[e.to] = i;
            if (!inQueue[e.to]) {
              queue.push(e.to);
              inQueue[e.to] = true;
            }
          }
        });
      }
      if (dist[sink] === Number.POSITIVE_INFINITY) break;

      let bottleneck = Number.POSITIVE_INFINITY;
      for (let v = sink; v !== source; v = prevNode[v]) {
        bottleneck = Math.min(bottleneck, this.graph[prevNode[v]][prevEdge[v]].cap);
      }
      for (let v = sink; v !== source; v = prevNode[v]) {
        const e = this.graph[prevNode[v]][prevEdge[v]];
        e.cap -= bottleneck;
        this.graph[v][e.rev].cap += bottleneck;
      }
    }
  }
}

interface OptimalAssignmentOptions {
  /** Group ids to exclude from consideration entirely (used for alternatives analysis). */
  excludeGroupIds?: string[];
  /** Which side's preferences to weight more heavily. Defaults to "people". */
  priority?: OptimalPriority;
  /** Restrict pairing to sides that ranked each other (indifferent sides always qualify). */
  mutualOnly?: boolean;
  /** Force-fill any seats still open after the flow solve with remaining unmatched people, regardless of preference — still subject to mutualOnly. */
  fillGroups?: boolean;
}

/**
 * Finds the assignment that seats the maximum possible number of people into a group
 * they themselves ranked and, among all assignments achieving that maximum, minimizes
 * total weighted cost. Solved as min-cost max-flow rather than brute-force permutations,
 * which are infeasible past a handful of people.
 *
 * `priority` controls how much group-side preference counts alongside person-side
 * preference (see PRIORITY_WEIGHTS); at the default "people" weighting this reduces to
 * purely optimizing people's stated happiness, so the result may not be a stable
 * matching. Never places anyone into a group they didn't rank (indifferent people, who
 * ranked nothing, are willing to go anywhere at no person-side cost, same as elsewhere
 * in this module).
 */
export function runOptimalAssignment(
  people: Person[],
  groups: Group[],
  options: OptimalAssignmentOptions = {},
): MatchResult {
  const exclude = new Set(options.excludeGroupIds ?? []);
  const weights = PRIORITY_WEIGHTS[options.priority ?? "people"];
  const activeGroups = groups.filter((g) => !exclude.has(g.id));
  const groupIndexById = new Map(activeGroups.map((g, i) => [g.id, i]));
  const groupById = new Map(activeGroups.map((g) => [g.id, g]));
  const allGroupIds = activeGroups.map((g) => g.id);

  const source = 0;
  const personNode = (i: number) => 1 + i;
  const groupNode = (i: number) => 1 + people.length + i;
  const sink = 1 + people.length + activeGroups.length;

  const flow = new MinCostFlow(sink + 1);
  const personEdges = new Map<string, { node: number; edgeIdx: number; groupId: string }[]>();

  people.forEach((p, i) => {
    flow.addEdge(source, personNode(i), 1, 0);
    const rankings = p.rankings.length > 0 ? p.rankings : allGroupIds;
    const edges: { node: number; edgeIdx: number; groupId: string }[] = [];
    const seen = new Set<string>();
    rankings.forEach((groupId, rankIdx) => {
      if (seen.has(groupId)) return;
      const gi = groupIndexById.get(groupId);
      if (gi === undefined) return;
      if (options.mutualOnly && !isMutuallyEligible(p, groupById.get(groupId)!)) return;
      seen.add(groupId);
      const personCost = p.rankings.length > 0 ? rankIdx : 0;
      const groupCost = groupPreferenceCost(groupById.get(groupId)!, p.id);
      const cost = weights.person * personCost + weights.group * groupCost;
      const edgeIdx = flow.addEdge(personNode(i), groupNode(gi), 1, cost);
      edges.push({ node: personNode(i), edgeIdx, groupId });
    });
    personEdges.set(p.id, edges);
  });

  activeGroups.forEach((g, i) => {
    flow.addEdge(groupNode(i), sink, g.capacity, 0);
  });

  flow.run(source, sink);

  const matchedGroup = new Map<string, string | null>(
    people.map((p) => {
      const edges = personEdges.get(p.id)!;
      const used = edges.find((e) => flow.remainingCap(e.node, e.edgeIdx) === 0);
      return [p.id, used?.groupId ?? null];
    }),
  );

  const forced = new Set<string>();
  if (options.fillGroups) {
    // Mirrors the fillGroups pass in runGaleShapley: seats the flow solve left open
    // can't belong to any remaining unmatched person's edges, so filling them means
    // pairing outside stated preference entirely.
    const remainingCapacity = new Map<string, number>(
      activeGroups.map((g) => [
        g.id,
        g.capacity - people.filter((p) => matchedGroup.get(p.id) === g.id).length,
      ]),
    );
    for (const group of activeGroups) {
      let capacity = remainingCapacity.get(group.id)!;
      if (capacity <= 0) continue;
      for (const p of people) {
        if (capacity <= 0) break;
        if (matchedGroup.get(p.id) !== null) continue;
        if (options.mutualOnly && !isMutuallyEligible(p, group)) continue;
        matchedGroup.set(p.id, group.id);
        forced.add(p.id);
        capacity--;
      }
    }
  }

  const assignments: Assignment[] = people.map((p) => ({
    personId: p.id,
    groupId: matchedGroup.get(p.id) ?? null,
  }));

  return {
    assignments,
    runAt: new Date().toISOString(),
    bumpedPersonIds: [],
    shiftedPersonIds: [],
    backfilledPersonIds: [],
    forcedPersonIds: [...forced],
  };
}

/** 1-indexed rank of the group within the person's preference list, or null if unranked/unmatched. */
export function getAchievedRank(person: Person, groupId: string | null): number | null {
  if (!groupId) return null;
  const idx = person.rankings.indexOf(groupId);
  return idx === -1 ? null : idx + 1;
}

/** 1-indexed rank of the person within the group's preference list, or null if unranked/unmatched. */
export function getGroupAchievedRank(group: Group | undefined, personId: string): number | null {
  if (!group) return null;
  const idx = group.rankings.indexOf(personId);
  return idx === -1 ? null : idx + 1;
}

export interface GroupFillRate {
  groupId: string;
  assigned: number;
  capacity: number;
}

export function computeGroupFillRates(groups: Group[], assignments: Assignment[]): GroupFillRate[] {
  const counts = new Map<string, number>(groups.map((g) => [g.id, 0]));
  for (const a of assignments) {
    if (a.groupId && counts.has(a.groupId)) {
      counts.set(a.groupId, counts.get(a.groupId)! + 1);
    }
  }
  return groups.map((g) => ({
    groupId: g.id,
    assigned: counts.get(g.id) ?? 0,
    capacity: g.capacity,
  }));
}

export interface BlockingPair {
  personId: string;
  groupId: string;
}

/**
 * Finds all (person, group) blocking pairs: the person prefers the group over their
 * current match, and the group either has an open slot or prefers the person over
 * one of its current members. Indifferent groups (no stated preferences) can only be
 * blocked via an open slot, never via a preference violation.
 */
export function findBlockingPairs(
  people: Person[],
  groups: Group[],
  assignments: Assignment[],
): BlockingPair[] {
  const groupMap = new Map(groups.map((g) => [g.id, g]));
  const assignedGroup = new Map(assignments.map((a) => [a.personId, a.groupId]));
  const membersByGroup = new Map<string, string[]>(groups.map((g) => [g.id, []]));
  for (const a of assignments) {
    if (a.groupId) membersByGroup.get(a.groupId)?.push(a.personId);
  }

  const blocking: BlockingPair[] = [];

  for (const person of people) {
    const currentGroupId = assignedGroup.get(person.id) ?? null;
    const currentRank = currentGroupId ? person.rankings.indexOf(currentGroupId) : Number.POSITIVE_INFINITY;
    const preferredRank = currentRank === -1 ? Number.POSITIVE_INFINITY : currentRank;

    for (let i = 0; i < preferredRank && i < person.rankings.length; i++) {
      const groupId = person.rankings[i];
      const group = groupMap.get(groupId);
      if (!group) continue;
      if (groupId === currentGroupId) continue;

      const members = membersByGroup.get(groupId) ?? [];
      const hasOpenSlot = members.length < group.capacity;
      const prefersOverMember =
        group.rankings.length > 0 &&
        members.some((memberId) => groupPreferenceRank(group, person.id) < groupPreferenceRank(group, memberId));

      if (hasOpenSlot || prefersOverMember) {
        blocking.push({ personId: person.id, groupId });
      }
    }
  }

  return blocking;
}

/**
 * For each person, the group they would be assigned if their currently assigned
 * group were removed entirely from consideration (re-runs the algorithm excluding it).
 */
export function computeAlternatives(
  people: Person[],
  groups: Group[],
  assignments: Assignment[],
  options: {
    fillUnmatched?: boolean;
    method?: MatchingMethod;
    priority?: OptimalPriority;
    mutualOnly?: boolean;
    fillGroups?: boolean;
  } = {},
): Map<string, string | null> {
  const alternatives = new Map<string, string | null>();
  const assignedGroup = new Map(assignments.map((a) => [a.personId, a.groupId]));

  const byExcludedGroup = new Map<string, MatchResult>();
  for (const groupId of new Set(assignments.map((a) => a.groupId).filter((g): g is string => g !== null))) {
    byExcludedGroup.set(
      groupId,
      options.method === "optimal"
        ? runOptimalAssignment(people, groups, {
            excludeGroupIds: [groupId],
            priority: options.priority,
            mutualOnly: options.mutualOnly,
            fillGroups: options.fillGroups,
          })
        : runGaleShapley(people, groups, {
            excludeGroupIds: [groupId],
            fillUnmatched: options.fillUnmatched,
            mutualOnly: options.mutualOnly,
            fillGroups: options.fillGroups,
          }),
    );
  }

  for (const person of people) {
    const currentGroupId = assignedGroup.get(person.id) ?? null;
    if (!currentGroupId) {
      alternatives.set(person.id, null);
      continue;
    }
    const rerun = byExcludedGroup.get(currentGroupId)!;
    const newAssignment = rerun.assignments.find((a) => a.personId === person.id);
    alternatives.set(person.id, newAssignment?.groupId ?? null);
  }

  return alternatives;
}
