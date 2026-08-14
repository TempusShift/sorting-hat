import { describe, expect, it } from "vitest";
import {
  computeAlternatives,
  computeGroupFillRates,
  DEFAULT_OPTIMAL_PRIORITY,
  findBlockingPairs,
  getAchievedRank,
  getAdjustedGroupHappiness,
  getAdjustedPersonHappiness,
  getGroupHappinessRank,
  getHappinessRank,
  OPTIMAL_PRIORITY_MAX,
  runGaleShapley,
  runOptimalAssignment,
} from "./algorithm";
import type { Group, Person } from "./types";

function person(id: string, rankings: string[]): Person {
  return { id, name: id, rankings };
}

function group(id: string, capacity: number, rankings: string[] = []): Group {
  return { id, name: id, capacity, rankings };
}

describe("runGaleShapley", () => {
  it("assigns everyone to their top choice when capacity allows", () => {
    const people = [person("alice", ["eng", "design"]), person("bob", ["design", "eng"])];
    const groups = [group("eng", 1), group("design", 1)];
    const result = runGaleShapley(people, groups);
    expect(result.assignments).toEqual(
      expect.arrayContaining([
        { personId: "alice", groupId: "eng" },
        { personId: "bob", groupId: "design" },
      ]),
    );
  });

  it("resolves competition using group preferences", () => {
    // Both alice and bob want eng first, but eng only has 1 slot and prefers bob.
    const people = [person("alice", ["eng", "design"]), person("bob", ["eng", "design"])];
    const groups = [group("eng", 1, ["bob", "alice"]), group("design", 1)];
    const result = runGaleShapley(people, groups);
    expect(result.assignments).toEqual(
      expect.arrayContaining([
        { personId: "bob", groupId: "eng" },
        { personId: "alice", groupId: "design" },
      ]),
    );
  });

  it("evicts a tentatively-matched person when a more-preferred person proposes later", () => {
    const people = [
      person("alice", ["eng"]),
      person("bob", ["eng"]),
    ];
    const groups = [group("eng", 1, ["bob", "alice"])];
    const result = runGaleShapley(people, groups);
    const bobAssignment = result.assignments.find((a) => a.personId === "bob");
    const aliceAssignment = result.assignments.find((a) => a.personId === "alice");
    expect(bobAssignment?.groupId).toBe("eng");
    expect(aliceAssignment?.groupId).toBeNull();
  });

  it("keeps the earlier arrival in an indifferent group when tied on their own preference", () => {
    const people = [person("alice", ["eng"]), person("bob", ["eng"])];
    const groups = [group("eng", 1)]; // no preferences; both rank eng identically -> FIFO
    const result = runGaleShapley(people, groups);
    const aliceAssignment = result.assignments.find((a) => a.personId === "alice");
    const bobAssignment = result.assignments.find((a) => a.personId === "bob");
    expect(aliceAssignment?.groupId).toBe("eng");
    expect(bobAssignment?.groupId).toBeNull();
  });

  it("lets a person who wants an indifferent group more evict a less-enthusiastic earlier arrival", () => {
    // eng has no stated preferences, so it can't judge candidates itself. Alice only
    // gets to eng as her second choice (design is unknown/skipped), while bob ranks
    // eng first. Bob should bump alice out once eng is full.
    const people = [person("alice", ["ghost", "eng"]), person("bob", ["eng"])];
    const groups = [group("eng", 1)];
    const result = runGaleShapley(people, groups);
    const aliceAssignment = result.assignments.find((a) => a.personId === "alice");
    const bobAssignment = result.assignments.find((a) => a.personId === "bob");
    expect(bobAssignment?.groupId).toBe("eng");
    expect(aliceAssignment?.groupId).toBeNull();
    expect(result.bumpedPersonIds).toContain("alice");
  });

  it("leaves a person unmatched if all their preferences are exhausted or full", () => {
    const people = [person("alice", ["eng"])];
    const groups = [group("eng", 0)];
    const result = runGaleShapley(people, groups);
    expect(result.assignments).toEqual([{ personId: "alice", groupId: null }]);
  });

  it("lets an indifferent person (no rankings) fill any group with an open slot", () => {
    const people = [person("alice", [])];
    const groups = [group("eng", 1)];
    const result = runGaleShapley(people, groups);
    expect(result.assignments).toEqual([{ personId: "alice", groupId: "eng" }]);
  });

  it("does not let an indifferent person displace someone a group actually prefers", () => {
    const people = [person("alice", []), person("bob", ["eng"])];
    const groups = [group("eng", 1, ["bob"])];
    const result = runGaleShapley(people, groups);
    const bobAssignment = result.assignments.find((a) => a.personId === "bob");
    const aliceAssignment = result.assignments.find((a) => a.personId === "alice");
    expect(bobAssignment?.groupId).toBe("eng");
    expect(aliceAssignment?.groupId).toBeNull();
  });

  it("skips unknown group ids in a person's rankings", () => {
    const people = [person("alice", ["ghost", "eng"])];
    const groups = [group("eng", 1)];
    const result = runGaleShapley(people, groups);
    expect(result.assignments).toEqual([{ personId: "alice", groupId: "eng" }]);
  });

  it("excludes groups passed via excludeGroupIds", () => {
    const people = [person("alice", ["eng", "design"])];
    const groups = [group("eng", 1), group("design", 1)];
    const result = runGaleShapley(people, groups, { excludeGroupIds: ["eng"] });
    expect(result.assignments).toEqual([{ personId: "alice", groupId: "design" }]);
  });

  it("reports bumped people who were evicted from a tentative match", () => {
    const people = [person("alice", ["eng"]), person("bob", ["eng"])];
    const groups = [group("eng", 1, ["bob", "alice"])];
    const result = runGaleShapley(people, groups);
    expect(result.bumpedPersonIds).toEqual(["alice"]);
  });

  it("reports no bumps or shifts for a plain run", () => {
    const people = [person("alice", ["eng", "design"]), person("bob", ["design", "eng"])];
    const groups = [group("eng", 1), group("design", 1)];
    const result = runGaleShapley(people, groups);
    expect(result.bumpedPersonIds).toEqual([]);
    expect(result.shiftedPersonIds).toEqual([]);
  });

  describe("fillUnmatched", () => {
    it("leaves people unmatched by default even when capacity exists elsewhere", () => {
      // Bob proposes first and claims eng (his top choice), leaving alice — who only
      // ranked eng — stuck, even though design still has room.
      const people = [person("bob", ["eng", "design"]), person("alice", ["eng"])];
      const groups = [group("eng", 1), group("design", 1)];
      const result = runGaleShapley(people, groups);
      expect(result.assignments).toEqual(
        expect.arrayContaining([{ personId: "alice", groupId: null }, { personId: "bob", groupId: "eng" }]),
      );
      expect(result.shiftedPersonIds).toEqual([]);
    });

    it("shifts a matched person to another group they ranked, to seat someone who has no alternative", () => {
      const people = [person("bob", ["eng", "design"]), person("alice", ["eng"])];
      const groups = [group("eng", 1), group("design", 1)];
      const result = runGaleShapley(people, groups, { fillUnmatched: true });
      const aliceAssignment = result.assignments.find((a) => a.personId === "alice");
      const bobAssignment = result.assignments.find((a) => a.personId === "bob");
      expect(aliceAssignment?.groupId).toBe("eng");
      expect(bobAssignment?.groupId).toBe("design");
      expect(result.shiftedPersonIds).toEqual(["bob"]);
    });

    it("never moves anyone into a group they did not rank", () => {
      const people = [person("bob", ["eng"]), person("alice", ["eng"])];
      const groups = [group("eng", 1), group("design", 1)];
      // Bob only ranked eng, so even though design has room, he can't be shifted there.
      const result = runGaleShapley(people, groups, { fillUnmatched: true });
      const unmatched = result.assignments.filter((a) => a.groupId === null);
      expect(unmatched).toHaveLength(1);
      expect(result.shiftedPersonIds).toEqual([]);
    });

    it("does not shift anyone into an excluded group", () => {
      const people = [person("bob", ["eng", "design"]), person("alice", ["eng"])];
      const groups = [group("eng", 1), group("design", 1)];
      const result = runGaleShapley(people, groups, { fillUnmatched: true, excludeGroupIds: ["design"] });
      const aliceAssignment = result.assignments.find((a) => a.personId === "alice");
      expect(aliceAssignment?.groupId).toBeNull();
    });

    it("leaves a person unmatched if truly no capacity remains anywhere", () => {
      const people = [person("alice", ["eng"]), person("bob", ["eng"])];
      const groups = [group("eng", 1)];
      const result = runGaleShapley(people, groups, { fillUnmatched: true });
      const unmatched = result.assignments.filter((a) => a.groupId === null);
      expect(unmatched).toHaveLength(1);
    });

    it("chains a shift through multiple groups when needed", () => {
      // bob claims eng and alice claims design first (both have a second choice);
      // carol only wants eng, so seating her should bump bob to design, which in
      // turn bumps alice to marketing.
      const people = [
        person("bob", ["eng", "design"]),
        person("alice", ["design", "marketing"]),
        person("carol", ["eng"]),
      ];
      const groups = [group("eng", 1), group("design", 1), group("marketing", 1)];

      const withoutFill = runGaleShapley(people, groups);
      const byIdBefore = new Map(withoutFill.assignments.map((a) => [a.personId, a.groupId]));
      expect(byIdBefore.get("bob")).toBe("eng");
      expect(byIdBefore.get("alice")).toBe("design");
      expect(byIdBefore.get("carol")).toBeNull();

      const result = runGaleShapley(people, groups, { fillUnmatched: true });
      const byId = new Map(result.assignments.map((a) => [a.personId, a.groupId]));
      expect(byId.get("carol")).toBe("eng");
      expect(byId.get("bob")).toBe("design");
      expect(byId.get("alice")).toBe("marketing");
      expect(new Set(result.shiftedPersonIds)).toEqual(new Set(["bob", "alice"]));
    });
  });

  describe("mutualOnly", () => {
    it("blocks a pairing when the group has preferences but didn't rank the person", () => {
      // eng has open capacity and would normally accept alice FIFO, but eng stated
      // preferences that don't include her.
      const people = [person("alice", ["eng"])];
      const groups = [group("eng", 1, ["bob"])];
      const result = runGaleShapley(people, groups, { mutualOnly: true });
      expect(result.assignments).toEqual([{ personId: "alice", groupId: null }]);
    });

    it("allows a pairing when the group has no stated preferences (indifferent)", () => {
      const people = [person("alice", ["eng"])];
      const groups = [group("eng", 1)];
      const result = runGaleShapley(people, groups, { mutualOnly: true });
      expect(result.assignments).toEqual([{ personId: "alice", groupId: "eng" }]);
    });

    it("allows a pairing when both sides ranked each other", () => {
      const people = [person("alice", ["eng"])];
      const groups = [group("eng", 1, ["alice"])];
      const result = runGaleShapley(people, groups, { mutualOnly: true });
      expect(result.assignments).toEqual([{ personId: "alice", groupId: "eng" }]);
    });
  });

  describe("fillGroups", () => {
    it("leaves a seat empty when there's nobody left to fill it", () => {
      const people = [person("alice", ["design"])];
      const groups = [group("eng", 1), group("design", 1)];
      const result = runGaleShapley(people, groups, { fillGroups: true });
      const byId = new Map(result.assignments.map((a) => [a.personId, a.groupId]));
      expect(byId.get("alice")).toBe("design");
      expect(result.forcedPersonIds).toEqual([]);
    });

    it("seats an unmatched person into a group neither side ranked", () => {
      const people = [person("alice", ["eng"]), person("bob", ["eng"])];
      const groups = [group("eng", 1), group("design", 1)];
      const result = runGaleShapley(people, groups, { fillGroups: true });
      const byId = new Map(result.assignments.map((a) => [a.personId, a.groupId]));
      expect([byId.get("alice"), byId.get("bob")].sort()).toEqual(["design", "eng"]);
      expect(result.forcedPersonIds).toHaveLength(1);
    });

    it("respects mutualOnly when force-filling", () => {
      const people = [person("alice", ["eng"]), person("bob", ["eng"])];
      const groups = [group("eng", 1), group("design", 1, ["carol"])];
      const result = runGaleShapley(people, groups, { fillGroups: true, mutualOnly: true });
      const unmatched = result.assignments.filter((a) => a.groupId === null);
      expect(unmatched).toHaveLength(1);
      expect(result.forcedPersonIds).toEqual([]);
    });

    it("never exceeds a group's capacity", () => {
      const people = [person("alice", []), person("bob", []), person("carol", [])];
      const groups = [group("eng", 1)];
      const result = runGaleShapley(people, groups, { fillGroups: true });
      const seated = result.assignments.filter((a) => a.groupId === "eng");
      expect(seated).toHaveLength(1);
    });

    it("tops an empty group up to one member, not to full capacity", () => {
      // "other" isn't a real group, so none of these three match during normal GS —
      // they only get seated via the fillGroups pass.
      const people = [person("alice", ["other"]), person("bob", ["other"]), person("carol", ["other"])];
      const groups = [group("eng", 3)];
      const result = runGaleShapley(people, groups, { fillGroups: true });
      const seated = result.assignments.filter((a) => a.groupId === "eng");
      expect(seated).toHaveLength(1);
      expect(result.assignments.filter((a) => a.groupId === null)).toHaveLength(2);
    });

    it("leaves an already-nonempty group alone even if under capacity", () => {
      const people = [person("alice", ["eng"]), person("bob", ["other"])];
      const groups = [group("eng", 3)];
      const result = runGaleShapley(people, groups, { fillGroups: true });
      const byId = new Map(result.assignments.map((a) => [a.personId, a.groupId]));
      expect(byId.get("alice")).toBe("eng");
      expect(byId.get("bob")).toBeNull();
      expect(result.forcedPersonIds).toEqual([]);
    });
  });
});

describe("runOptimalAssignment", () => {
  it("achieves the best possible mean rank given capacity constraints", () => {
    // Both alice and bob rank eng first, design second, but eng only has one seat, so
    // one of them has to take their second choice — the best achievable mean is 1.5.
    const people = [person("alice", ["eng", "design"]), person("bob", ["eng", "design"])];
    const groups = [group("eng", 1), group("design", 1)];
    const result = runOptimalAssignment(people, groups);
    const byId = new Map(result.assignments.map((a) => [a.personId, a.groupId]));
    const ranks = people.map((p) => getAchievedRank(p, byId.get(p.id) ?? null)!);
    expect(ranks.filter((r) => r !== null)).toHaveLength(2);
    expect((ranks[0] + ranks[1]) / 2).toBe(1.5);
  });

  it("maximizes matched count before minimizing rank", () => {
    // carol only ranks eng; if bob greedily took eng for a rank-1, carol would be shut
    // out entirely. Matching everyone (even at a worse mean) wins over a lower mean rank.
    const people = [
      person("bob", ["eng", "design"]),
      person("alice", ["design", "marketing"]),
      person("carol", ["eng"]),
    ];
    const groups = [group("eng", 1), group("design", 1), group("marketing", 1)];
    const result = runOptimalAssignment(people, groups);
    const unmatched = result.assignments.filter((a) => a.groupId === null);
    expect(unmatched).toHaveLength(0);
  });

  it("never assigns anyone to a group they did not rank", () => {
    const people = [person("alice", ["eng"]), person("bob", ["eng"])];
    const groups = [group("eng", 1), group("design", 1)];
    const result = runOptimalAssignment(people, groups);
    const bobAssignment = result.assignments.find((a) => a.personId === "bob");
    expect(bobAssignment?.groupId).toBeNull();
  });

  it("lets an indifferent person (no rankings) fill any remaining group", () => {
    const people = [person("alice", [])];
    const groups = [group("eng", 1)];
    const result = runOptimalAssignment(people, groups);
    expect(result.assignments).toEqual([{ personId: "alice", groupId: "eng" }]);
  });

  it("respects group capacity", () => {
    const people = [person("alice", ["eng"]), person("bob", ["eng"]), person("carol", ["eng"])];
    const groups = [group("eng", 2)];
    const result = runOptimalAssignment(people, groups);
    const matched = result.assignments.filter((a) => a.groupId === "eng");
    expect(matched).toHaveLength(2);
  });

  it("excludes groups passed via excludeGroupIds", () => {
    const people = [person("alice", ["eng", "design"])];
    const groups = [group("eng", 1), group("design", 1)];
    const result = runOptimalAssignment(people, groups, { excludeGroupIds: ["eng"] });
    expect(result.assignments).toEqual([{ personId: "alice", groupId: "design" }]);
  });

  it("ignores group-side preferences by default (may not be a stable matching)", () => {
    // eng prefers alice, but bob only ranked eng, leaving alice/design + bob/eng as the
    // only feasible pairing regardless of priority.
    const people = [person("alice", ["design", "eng"]), person("bob", ["eng"])];
    const groups = [group("eng", 1, ["alice"]), group("design", 1)];
    const result = runOptimalAssignment(people, groups);
    const byId = new Map(result.assignments.map((a) => [a.personId, a.groupId]));
    expect(byId.get("alice")).toBe("design");
    expect(byId.get("bob")).toBe("eng");
  });

  it("with priority 8 (groups only), defers to which candidate each group prefers over the people's own rank order", () => {
    // alice ranks eng first, bob ranks design first — but eng only wants bob and design
    // only wants alice. Both arrangements match everyone, so priority decides the winner.
    const people = [person("alice", ["eng", "design"]), person("bob", ["design", "eng"])];
    const groups = [group("eng", 1, ["bob"]), group("design", 1, ["alice"])];
    const result = runOptimalAssignment(people, groups, { priority: OPTIMAL_PRIORITY_MAX });
    const byId = new Map(result.assignments.map((a) => [a.personId, a.groupId]));
    expect(byId.get("alice")).toBe("design");
    expect(byId.get("bob")).toBe("eng");
  });

  it("with priority balanced (4), still never assigns anyone outside their own rankings", () => {
    const people = [person("alice", ["eng", "design"]), person("bob", ["design", "eng"])];
    const groups = [group("eng", 1, ["bob"]), group("design", 1, ["alice"])];
    const result = runOptimalAssignment(people, groups, { priority: DEFAULT_OPTIMAL_PRIORITY });
    for (const a of result.assignments) {
      const p = people.find((person) => person.id === a.personId)!;
      expect(a.groupId === null || p.rankings.includes(a.groupId)).toBe(true);
    }
    expect(result.assignments.filter((a) => a.groupId !== null)).toHaveLength(2);
  });

  describe("mutualOnly", () => {
    it("excludes a group from a person's edges when the group didn't rank them back", () => {
      const people = [person("alice", ["eng"])];
      const groups = [group("eng", 1, ["bob"])];
      const result = runOptimalAssignment(people, groups, { mutualOnly: true });
      expect(result.assignments).toEqual([{ personId: "alice", groupId: null }]);
    });

    it("still matches when both sides ranked each other", () => {
      const people = [person("alice", ["eng"])];
      const groups = [group("eng", 1, ["alice"])];
      const result = runOptimalAssignment(people, groups, { mutualOnly: true });
      expect(result.assignments).toEqual([{ personId: "alice", groupId: "eng" }]);
    });
  });

  describe("fillGroups", () => {
    it("force-fills a seat left open by the flow solve", () => {
      const people = [person("alice", ["eng"]), person("bob", ["eng"])];
      const groups = [group("eng", 1), group("design", 1)];
      const result = runOptimalAssignment(people, groups, { fillGroups: true });
      const unmatched = result.assignments.filter((a) => a.groupId === null);
      expect(unmatched).toHaveLength(0);
      expect(result.forcedPersonIds).toHaveLength(1);
    });

    it("respects mutualOnly when force-filling", () => {
      const people = [person("alice", ["eng"]), person("bob", ["eng"])];
      const groups = [group("eng", 1), group("design", 1, ["carol"])];
      const result = runOptimalAssignment(people, groups, { fillGroups: true, mutualOnly: true });
      const unmatched = result.assignments.filter((a) => a.groupId === null);
      expect(unmatched).toHaveLength(1);
      expect(result.forcedPersonIds).toEqual([]);
    });

    it("tops an empty group up to one member, not to full capacity", () => {
      // "other" isn't a real group, so none of these three match during the flow solve —
      // they only get seated via the fillGroups pass.
      const people = [person("alice", ["other"]), person("bob", ["other"]), person("carol", ["other"])];
      const groups = [group("eng", 3)];
      const result = runOptimalAssignment(people, groups, { fillGroups: true });
      const seated = result.assignments.filter((a) => a.groupId === "eng");
      expect(seated).toHaveLength(1);
      expect(result.assignments.filter((a) => a.groupId === null)).toHaveLength(2);
    });
  });
});

describe("getAchievedRank", () => {
  it("returns the 1-indexed rank of the assigned group", () => {
    const alice = person("alice", ["design", "eng"]);
    expect(getAchievedRank(alice, "eng")).toBe(2);
    expect(getAchievedRank(alice, "design")).toBe(1);
  });

  it("returns null for unmatched or unranked groups", () => {
    const alice = person("alice", ["design"]);
    expect(getAchievedRank(alice, null)).toBeNull();
    expect(getAchievedRank(alice, "eng")).toBeNull();
  });
});

describe("getHappinessRank / getGroupHappinessRank", () => {
  it("scores an unranked match one worse than the least-preferred ranked one", () => {
    const alice = person("alice", ["a", "b", "c", "d", "e"]);
    expect(getHappinessRank(alice, "a")).toBe(1);
    expect(getHappinessRank(alice, "e")).toBe(5);
    expect(getHappinessRank(alice, "unranked-group")).toBe(6);
  });

  it("scores an indifferent person's match as rank 1", () => {
    const alice = person("alice", []);
    expect(getHappinessRank(alice, "anything")).toBe(1);
  });

  it("returns null when unmatched", () => {
    const alice = person("alice", ["a"]);
    expect(getHappinessRank(alice, null)).toBeNull();
  });

  it("mirrors the same rule from the group's side", () => {
    const eng = group("eng", 2, ["alice", "bob"]);
    expect(getGroupHappinessRank(eng, "alice")).toBe(1);
    expect(getGroupHappinessRank(eng, "carol")).toBe(3);
  });
});

describe("getAdjustedPersonHappiness / getAdjustedGroupHappiness", () => {
  it("leaves the score alone when there was no bump", () => {
    const alice = person("alice", ["a", "b", "c"]);
    expect(getAdjustedPersonHappiness(alice, "b", undefined)).toBe(2);
  });

  it("penalizes landing worse than the group they were bumped out of", () => {
    const alice = person("alice", ["a", "b", "c"]);
    // Bumped out of "a" (rank 1), landed in "c" (rank 3): a 2-slot drop adds a 2-point penalty.
    expect(
      getAdjustedPersonHappiness(alice, "c", { groupId: "a", byPersonId: "bob" }),
    ).toBe(5);
  });

  it("rewards landing better than the group they were bumped out of", () => {
    const alice = person("alice", ["a", "b", "c"]);
    // Bumped out of "c" (rank 3), landed in "a" (rank 1): a 2-slot gain subtracts 2 points.
    expect(
      getAdjustedPersonHappiness(alice, "a", { groupId: "c", byPersonId: "bob" }),
    ).toBe(-1);
  });

  it("mirrors the bump adjustment for a group over each person it evicted", () => {
    const eng = group("eng", 1, ["alice", "bob", "carol"]);
    // eng evicted carol (rank 3) to seat alice (rank 1): a 2-slot gain subtracts 2 points.
    expect(getAdjustedGroupHappiness(eng, "alice", ["carol"])).toBe(-1);
    expect(getAdjustedGroupHappiness(eng, "alice", [])).toBe(1);
  });
});

describe("computeGroupFillRates", () => {
  it("counts assignments per group", () => {
    const groups = [group("eng", 2), group("design", 1)];
    const assignments = [
      { personId: "alice", groupId: "eng" },
      { personId: "bob", groupId: "eng" },
      { personId: "carol", groupId: null },
    ];
    expect(computeGroupFillRates(groups, assignments)).toEqual([
      { groupId: "eng", assigned: 2, capacity: 2 },
      { groupId: "design", assigned: 0, capacity: 1 },
    ]);
  });
});

describe("findBlockingPairs", () => {
  it("finds a pair when a group has an open slot the person prefers over their current match", () => {
    const people = [person("alice", ["design", "eng"])];
    const groups = [group("design", 1), group("eng", 1)];
    const assignments = [{ personId: "alice", groupId: "eng" }];
    const pairs = findBlockingPairs(people, groups, assignments);
    expect(pairs).toEqual([{ personId: "alice", groupId: "design" }]);
  });

  it("finds no blocking pairs for a fully stable matching", () => {
    const people = [person("alice", ["eng", "design"]), person("bob", ["design", "eng"])];
    const groups = [group("eng", 1), group("design", 1)];
    const result = runGaleShapley(people, groups);
    const pairs = findBlockingPairs(people, groups, result.assignments);
    expect(pairs).toEqual([]);
  });

  it("does not flag indifferent full groups as blockable via preference", () => {
    const people = [person("alice", ["eng"]), person("bob", ["eng"])];
    const groups = [group("eng", 1)]; // indifferent
    const assignments = [
      { personId: "alice", groupId: "eng" },
      { personId: "bob", groupId: null },
    ];
    const pairs = findBlockingPairs(people, groups, assignments);
    expect(pairs).toEqual([]);
  });
});

describe("computeAlternatives", () => {
  it("finds an open seat the person could move into without bumping anyone", () => {
    // design has 2 seats and only 1 filled, so alice could move there for free.
    const people = [person("alice", ["eng", "design"]), person("bob", ["design"])];
    const groups = [group("eng", 1), group("design", 2)];
    const result = runGaleShapley(people, groups);
    const alternatives = computeAlternatives(people, groups, result.assignments);
    // alice ranked eng #1 and design #2, so moving is a worse outcome for her (+1);
    // group-side nets to 0 since both groups are equally indifferent (rankings-less).
    expect(alternatives.get("alice")).toEqual({
      groupId: "design",
      peopleHappinessDelta: 1,
      groupHappinessDelta: 0,
    });
  });

  it("finds no alternative when every other ranked group is already full", () => {
    const people = [person("alice", ["eng", "design"]), person("bob", ["design"])];
    const groups = [group("eng", 1), group("design", 1)];
    const result = runGaleShapley(people, groups);
    const alternatives = computeAlternatives(people, groups, result.assignments);
    expect(alternatives.get("alice")).toEqual({
      groupId: null,
      peopleHappinessDelta: null,
      groupHappinessDelta: null,
    });
  });

  it("maps unmatched people with no open seat available to a null impact", () => {
    const people = [person("alice", ["eng"])];
    const groups = [group("eng", 0)];
    const result = runGaleShapley(people, groups);
    const alternatives = computeAlternatives(people, groups, result.assignments);
    expect(alternatives.get("alice")).toEqual({
      groupId: null,
      peopleHappinessDelta: null,
      groupHappinessDelta: null,
    });
  });

  it("offers an open-seat alternative to someone currently unmatched", () => {
    const people = [person("alice", ["design"])];
    const groups = [group("design", 1)];
    const assignments = [{ personId: "alice", groupId: null }];
    const alternatives = computeAlternatives(people, groups, assignments);
    expect(alternatives.get("alice")).toEqual({
      groupId: "design",
      peopleHappinessDelta: -2,
      groupHappinessDelta: -1,
    });
  });

  it("never suggests a move into a full group, even one that prefers this person", () => {
    // design ranks alice over bob, so a full rerun would bump bob to seat alice there —
    // but computeAlternatives should never suggest that, only genuinely open seats.
    const people = [person("alice", ["eng", "design"]), person("bob", ["design"])];
    const groups = [group("eng", 1, ["alice"]), group("design", 1, ["bob", "alice"])];
    const result = runGaleShapley(people, groups);
    const alternatives = computeAlternatives(people, groups, result.assignments);
    expect(alternatives.get("alice")?.groupId).toBeNull();
  });
});
