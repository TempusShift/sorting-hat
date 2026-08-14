import type {
  Assignment,
  BumpDetail,
  Group,
  MatchResult,
  Person,
} from "./types";

export type MatchingMethod = "stable" | "optimal";

/**
 * Which side's preferences the optimal solve weights more heavily, as a 17-step slider:
 * 0 weights people's stated preferences exclusively, 16 weights groups' exclusively, and
 * 8 (the default) weights both equally. Steps in between ramp linearly, one step at a time,
 * so odds near the middle move in finer increments than a coarser scale would allow.
 */
export type OptimalPriority = number;

export const OPTIMAL_PRIORITY_MIN = 0;
export const OPTIMAL_PRIORITY_MAX = 16;
export const DEFAULT_OPTIMAL_PRIORITY = 8;

export function priorityWeights(step: OptimalPriority): {
  person: number;
  group: number;
} {
  const clamped = Math.min(
    OPTIMAL_PRIORITY_MAX,
    Math.max(OPTIMAL_PRIORITY_MIN, step),
  );
  return { person: OPTIMAL_PRIORITY_MAX - clamped, group: clamped };
}

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
  /** Force at least one member into any group still empty after matching (and fillUnmatched) with a remaining unmatched person, regardless of preference — still subject to mutualOnly. */
  fillGroups?: boolean;
}

/** Whether a person and group are allowed to pair under mutualOnly: each side that stated any preferences must have included the other (indifferent sides always qualify). */
export function isMutuallyEligible(person: Person, group: Group): boolean {
  const personOk =
    person.rankings.length === 0 || person.rankings.includes(group.id);
  const groupOk =
    group.rankings.length === 0 || group.rankings.includes(person.id);
  return personOk && groupOk;
}

/**
 * Group's preference rank for a person: lower is more preferred.
 * Unranked people are treated as least-preferred (still acceptable).
 * If the group stated no preferences at all, ties are broken by how much the person
 * themselves wants this group (personRankOfGroup, lower = more wanted) — the group has
 * no basis of its own to prefer one candidate over another, so a contested seat goes to
 * whoever wants it most. Equal personRankOfGroup values (including two people who both
 * left the group unranked) are a true tie and never trigger an eviction.
 */
function groupPreferenceRank(
  group: Group,
  personId: string,
  personRankOfGroup = Number.POSITIVE_INFINITY,
): number {
  if (group.rankings.length > 0) {
    const idx = group.rankings.indexOf(personId);
    return idx === -1 ? Number.POSITIVE_INFINITY : idx;
  }
  return personRankOfGroup;
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
 * Groups with no stated preferences accept proposals up to capacity; once full, a
 * contested seat goes to whoever ranks the group most highly among the current holder
 * and the new proposer (ties keep the earlier arrival, i.e. FIFO), since the group
 * itself has no preference to consult.
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
  const matchedGroup = new Map<string, string | null>(
    people.map((p) => [p.id, null]),
  );
  const bumped = new Set<string>();
  const bumpDetails = new Map<string, BumpDetail>();

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
      } else if (members.length > 0) {
        const rankOfGroupFor = (id: string) => {
          const rankIdx = effectiveRankings.get(id)!.indexOf(groupId);
          return rankIdx === -1 ? Number.POSITIVE_INFINITY : rankIdx;
        };
        let worstMemberId = members[0];
        let worstRank = groupPreferenceRank(
          group,
          worstMemberId,
          rankOfGroupFor(worstMemberId),
        );
        for (const memberId of members) {
          const rank = groupPreferenceRank(
            group,
            memberId,
            rankOfGroupFor(memberId),
          );
          if (rank > worstRank) {
            worstRank = rank;
            worstMemberId = memberId;
          }
        }
        const candidateRank = groupPreferenceRank(
          group,
          personId,
          rankOfGroupFor(personId),
        );
        if (candidateRank < worstRank) {
          const pos = members.indexOf(worstMemberId);
          members.splice(pos, 1, personId);
          matchedGroup.set(personId, groupId);
          matchedGroup.set(worstMemberId, null);
          bumped.add(worstMemberId);
          bumpDetails.set(worstMemberId, { groupId, byPersonId: personId });
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
    const tryPlace = (
      personId: string,
      visitedGroups: Set<string>,
    ): boolean => {
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
    // Last resort: a group left with zero members at this point can't reach one via
    // any remaining unmatched person's own ranked list (GS never turns away an open
    // seat), so the only way to give it someone is to pair outside stated preference
    // entirely. Only guarantees one member per group, not a full house.
    for (const group of groups) {
      if (exclude.has(group.id)) continue;
      const members = tentative.get(group.id)!;
      const target = Math.min(1, group.capacity);
      if (members.length >= target) continue;
      for (const p of people) {
        if (members.length >= target) break;
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
    bumpDetails: Object.fromEntries(bumpDetails),
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
        bottleneck = Math.min(
          bottleneck,
          this.graph[prevNode[v]][prevEdge[v]].cap,
        );
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
  /** Which side's preferences to weight more heavily, 0-16. Defaults to DEFAULT_OPTIMAL_PRIORITY (balanced). */
  priority?: OptimalPriority;
  /** Restrict pairing to sides that ranked each other (indifferent sides always qualify). */
  mutualOnly?: boolean;
  /** Force at least one member into any group still empty after the flow solve with a remaining unmatched person, regardless of preference — still subject to mutualOnly. */
  fillGroups?: boolean;
}

/**
 * Finds the assignment that seats the maximum possible number of people into a group
 * they themselves ranked and, among all assignments achieving that maximum, minimizes
 * total weighted cost. Solved as min-cost max-flow rather than brute-force permutations,
 * which are infeasible past a handful of people.
 *
 * `priority` controls how much group-side preference counts alongside person-side
 * preference (see priorityWeights); at 0 (people only) this reduces to purely
 * optimizing people's stated happiness, so the result may not be a stable
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
  const weights = priorityWeights(options.priority ?? DEFAULT_OPTIMAL_PRIORITY);
  const activeGroups = groups.filter((g) => !exclude.has(g.id));
  const groupIndexById = new Map(activeGroups.map((g, i) => [g.id, i]));
  const groupById = new Map(activeGroups.map((g) => [g.id, g]));
  const allGroupIds = activeGroups.map((g) => g.id);

  const source = 0;
  const personNode = (i: number) => 1 + i;
  const groupNode = (i: number) => 1 + people.length + i;
  const sink = 1 + people.length + activeGroups.length;

  const flow = new MinCostFlow(sink + 1);
  const personEdges = new Map<
    string,
    { node: number; edgeIdx: number; groupId: string }[]
  >();

  people.forEach((p, i) => {
    flow.addEdge(source, personNode(i), 1, 0);
    const rankings = p.rankings.length > 0 ? p.rankings : allGroupIds;
    const edges: { node: number; edgeIdx: number; groupId: string }[] = [];
    const seen = new Set<string>();
    rankings.forEach((groupId, rankIdx) => {
      if (seen.has(groupId)) return;
      const gi = groupIndexById.get(groupId);
      if (gi === undefined) return;
      if (options.mutualOnly && !isMutuallyEligible(p, groupById.get(groupId)!))
        return;
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
      const used = edges.find(
        (e) => flow.remainingCap(e.node, e.edgeIdx) === 0,
      );
      return [p.id, used?.groupId ?? null];
    }),
  );

  const forced = new Set<string>();
  if (options.fillGroups) {
    // Mirrors the fillGroups pass in runGaleShapley: a group the flow solve left with
    // zero members can't reach one via any remaining unmatched person's edges, so
    // giving it someone means pairing outside stated preference entirely. Only
    // guarantees one member per empty group, not a full house.
    const remainingCapacity = new Map<string, number>(
      activeGroups.map((g) => {
        const memberCount = people.filter(
          (p) => matchedGroup.get(p.id) === g.id,
        ).length;
        return [g.id, memberCount > 0 ? 0 : Math.min(1, g.capacity)];
      }),
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
    bumpDetails: {},
  };
}

/** 1-indexed rank of the group within the person's preference list, or null if unranked/unmatched. */
export function getAchievedRank(
  person: Person,
  groupId: string | null,
): number | null {
  if (!groupId) return null;
  const idx = person.rankings.indexOf(groupId);
  return idx === -1 ? null : idx + 1;
}

/** 1-indexed rank of the person within the group's preference list, or null if unranked/unmatched. */
export function getGroupAchievedRank(
  group: Group | undefined,
  personId: string,
): number | null {
  if (!group) return null;
  const idx = group.rankings.indexOf(personId);
  return idx === -1 ? null : idx + 1;
}

/**
 * Person's happiness rank for a matched group: 1-indexed rank if they ranked it,
 * otherwise one slot worse than their least-preferred ranked group (rankings.length + 1)
 * — e.g. someone who ranked 5 groups scores an unranked match as rank 6. Null only when
 * unmatched.
 */
export function getHappinessRank(
  person: Person,
  groupId: string | null,
): number | null {
  if (!groupId) return null;
  const idx = person.rankings.indexOf(groupId);
  return idx === -1 ? person.rankings.length + 1 : idx + 1;
}

/**
 * Group's happiness rank for a member: mirrors getHappinessRank from the group's side.
 */
export function getGroupHappinessRank(
  group: Group | undefined,
  personId: string,
): number | null {
  if (!group) return null;
  const idx = group.rankings.indexOf(personId);
  return idx === -1 ? group.rankings.length + 1 : idx + 1;
}

/**
 * Person's happiness rank at their final group, adjusted for having been bumped along
 * the way: the score shifts by exactly the gap between the group they lost and where
 * they landed — worse (a larger number) if they ended up somewhere they liked less than
 * the seat they lost, better (a smaller number, even negative) if they landed somewhere
 * they liked more.
 */
export function getAdjustedPersonHappiness(
  person: Person,
  groupId: string | null,
  bumpDetail: BumpDetail | undefined,
): number | null {
  const base = getHappinessRank(person, groupId);
  if (base === null || !bumpDetail) return base;
  const lost = getHappinessRank(person, bumpDetail.groupId)!;
  return base + (base - lost);
}

/**
 * Group's happiness rank for a member, adjusted for any evictions the group performed
 * to seat them: mirrors getAdjustedPersonHappiness from the group's side, one adjustment
 * per person this member's admission bumped out of this same group.
 */
export function getAdjustedGroupHappiness(
  group: Group | undefined,
  personId: string,
  evictedPersonIds: string[],
): number | null {
  const base = getGroupHappinessRank(group, personId);
  if (base === null) return null;
  let adjustment = 0;
  for (const evictedId of evictedPersonIds) {
    const lost = getGroupHappinessRank(group, evictedId)!;
    adjustment += base - lost;
  }
  return base + adjustment;
}

export interface GroupFillRate {
  groupId: string;
  assigned: number;
  capacity: number;
}

export function computeGroupFillRates(
  groups: Group[],
  assignments: Assignment[],
): GroupFillRate[] {
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
  const assignedGroup = new Map(
    assignments.map((a) => [a.personId, a.groupId]),
  );
  const membersByGroup = new Map<string, string[]>(
    groups.map((g) => [g.id, []]),
  );
  for (const a of assignments) {
    if (a.groupId) membersByGroup.get(a.groupId)?.push(a.personId);
  }

  const blocking: BlockingPair[] = [];

  for (const person of people) {
    const currentGroupId = assignedGroup.get(person.id) ?? null;
    const currentRank = currentGroupId
      ? person.rankings.indexOf(currentGroupId)
      : Number.POSITIVE_INFINITY;
    const preferredRank =
      currentRank === -1 ? Number.POSITIVE_INFINITY : currentRank;

    for (let i = 0; i < preferredRank && i < person.rankings.length; i++) {
      const groupId = person.rankings[i];
      const group = groupMap.get(groupId);
      if (!group) continue;
      if (groupId === currentGroupId) continue;

      const members = membersByGroup.get(groupId) ?? [];
      const hasOpenSlot = members.length < group.capacity;
      const prefersOverMember =
        group.rankings.length > 0 &&
        members.some(
          (memberId) =>
            groupPreferenceRank(group, person.id) <
            groupPreferenceRank(group, memberId),
        );

      if (hasOpenSlot || prefersOverMember) {
        blocking.push({ personId: person.id, groupId });
      }
    }
  }

  return blocking;
}

/** Which people each (group, admitting person) pair evicted, keyed by "groupId|byPersonId". */
export function buildBumpEvictionIndex(
  bumpDetails: Record<string, BumpDetail>,
): Map<string, string[]> {
  const index = new Map<string, string[]>();
  for (const [evictedId, detail] of Object.entries(bumpDetails)) {
    const key = `${detail.groupId}|${detail.byPersonId}`;
    const list = index.get(key) ?? [];
    list.push(evictedId);
    index.set(key, list);
  }
  return index;
}

export interface AlternativeImpact {
  /** The group with an open seat this person could move into right now without displacing anyone, or null if none exists. */
  groupId: string | null;
  /** Change in this person's own happiness if they made that move (new rank minus current); null if no such seat exists. */
  peopleHappinessDelta: number | null;
  /** Net happiness change across the two affected groups: the seat vacated in their current group plus the seat filled in the new one. */
  groupHappinessDelta: number | null;
}

/**
 * For each person, the best group (by their own preference order, or group list order if
 * indifferent) that currently has an open seat they could move into without bumping anyone
 * else out — deliberately not a full rerun of the matching algorithm, since displacing
 * someone else would just create a new set of winners and losers rather than answer "is
 * there anywhere better for this one person, right now, for free."
 */
export function computeAlternatives(
  people: Person[],
  groups: Group[],
  assignments: Assignment[],
  options: {
    mutualOnly?: boolean;
    bumpDetails?: Record<string, BumpDetail>;
  } = {},
): Map<string, AlternativeImpact> {
  const bumpDetails = options.bumpDetails ?? {};
  const evictions = buildBumpEvictionIndex(bumpDetails);
  const groupById = new Map(groups.map((g) => [g.id, g]));
  const assignedGroup = new Map(assignments.map((a) => [a.personId, a.groupId]));
  const membersByGroup = new Map<string, string[]>(groups.map((g) => [g.id, []]));
  for (const a of assignments) {
    if (a.groupId) membersByGroup.get(a.groupId)?.push(a.personId);
  }

  const alternatives = new Map<string, AlternativeImpact>();

  for (const person of people) {
    const currentGroupId = assignedGroup.get(person.id) ?? null;
    const currentGroup = currentGroupId ? groupById.get(currentGroupId) : undefined;
    const candidateIds = person.rankings.length > 0 ? person.rankings : groups.map((g) => g.id);

    let targetId: string | null = null;
    for (const gid of candidateIds) {
      if (gid === currentGroupId) continue;
      const candidate = groupById.get(gid);
      if (!candidate) continue;
      if (options.mutualOnly && !isMutuallyEligible(person, candidate)) continue;
      const filled = membersByGroup.get(gid)?.length ?? 0;
      if (filled < candidate.capacity) {
        targetId = gid;
        break;
      }
    }

    if (!targetId) {
      alternatives.set(person.id, {
        groupId: null,
        peopleHappinessDelta: null,
        groupHappinessDelta: null,
      });
      continue;
    }
    const targetGroup = groupById.get(targetId)!;

    // An unmatched person has no current seat to compare against, so their "before" score
    // is the same fixed penalty an empty seat would carry (rankings.length + 2, one worse
    // than an unranked match) — same convention used throughout for a non-outcome.
    const oldPersonHappiness = currentGroupId
      ? getAdjustedPersonHappiness(person, currentGroupId, bumpDetails[person.id])!
      : person.rankings.length + 2;
    const newPersonHappiness = getHappinessRank(person, targetId)!;

    const newGroupHappiness = getGroupHappinessRank(targetGroup, person.id)!;
    const filledSeatWasEmpty = targetGroup.rankings.length + 2;
    // If they're currently seated somewhere, that seat goes empty in exchange — scored
    // the same way (rankings.length + 2) so a group losing its one happy member isn't
    // silently treated as a wash.
    const groupHappinessDelta = currentGroup
      ? currentGroup.rankings.length +
        2 -
        getAdjustedGroupHappiness(
          currentGroup,
          person.id,
          evictions.get(`${currentGroupId}|${person.id}`) ?? [],
        )! +
        (newGroupHappiness - filledSeatWasEmpty)
      : newGroupHappiness - filledSeatWasEmpty;

    alternatives.set(person.id, {
      groupId: targetId,
      peopleHappinessDelta: newPersonHappiness - oldPersonHappiness,
      groupHappinessDelta,
    });
  }

  return alternatives;
}
