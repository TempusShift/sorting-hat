import type { Assignment, Group, MatchResult, Person } from "./types";

interface GaleShapleyOptions {
  /** Group ids to exclude from the run entirely (used for alternatives analysis). */
  excludeGroupIds?: string[];
  /**
   * After stable matching converges, try to place each still-unmatched person by
   * shifting other people between groups they themselves ranked (an augmenting-path
   * search), never into a group nobody in the chain actually ranked.
   */
  fillUnmatched?: boolean;
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
    people.map((p) => [p.id, p.rankings.length > 0 ? p.rankings : allGroupIds]),
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
  };
}

/** 1-indexed rank of the group within the person's preference list, or null if unranked/unmatched. */
export function getAchievedRank(person: Person, groupId: string | null): number | null {
  if (!groupId) return null;
  const idx = person.rankings.indexOf(groupId);
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
  options: { fillUnmatched?: boolean } = {},
): Map<string, string | null> {
  const alternatives = new Map<string, string | null>();
  const assignedGroup = new Map(assignments.map((a) => [a.personId, a.groupId]));

  const byExcludedGroup = new Map<string, MatchResult>();
  for (const groupId of new Set(assignments.map((a) => a.groupId).filter((g): g is string => g !== null))) {
    byExcludedGroup.set(
      groupId,
      runGaleShapley(people, groups, { excludeGroupIds: [groupId], fillUnmatched: options.fillUnmatched }),
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
