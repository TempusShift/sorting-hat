import { describe, expect, it } from "vitest";
import {
  computeAlternatives,
  computeGroupFillRates,
  findBlockingPairs,
  getAchievedRank,
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

  it("fills indifferent groups FIFO without evicting earlier arrivals", () => {
    const people = [person("alice", ["eng"]), person("bob", ["eng"])];
    const groups = [group("eng", 1)]; // no preferences -> FIFO
    const result = runGaleShapley(people, groups);
    const aliceAssignment = result.assignments.find((a) => a.personId === "alice");
    const bobAssignment = result.assignments.find((a) => a.personId === "bob");
    expect(aliceAssignment?.groupId).toBe("eng");
    expect(bobAssignment?.groupId).toBeNull();
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
    // eng prefers alice, but the default "people" priority doesn't consult group preference at all.
    const people = [person("alice", ["design", "eng"]), person("bob", ["eng"])];
    const groups = [group("eng", 1, ["alice"]), group("design", 1)];
    const result = runOptimalAssignment(people, groups);
    const byId = new Map(result.assignments.map((a) => [a.personId, a.groupId]));
    expect(byId.get("alice")).toBe("design");
    expect(byId.get("bob")).toBe("eng");
  });

  it("with priority: groups, defers to which candidate each group prefers over the people's own rank order", () => {
    // alice ranks eng first, bob ranks design first — but eng only wants bob and design
    // only wants alice. Both arrangements match everyone, so priority decides the winner.
    const people = [person("alice", ["eng", "design"]), person("bob", ["design", "eng"])];
    const groups = [group("eng", 1, ["bob"]), group("design", 1, ["alice"])];
    const result = runOptimalAssignment(people, groups, { priority: "groups" });
    const byId = new Map(result.assignments.map((a) => [a.personId, a.groupId]));
    expect(byId.get("alice")).toBe("design");
    expect(byId.get("bob")).toBe("eng");
  });

  it("with priority: balanced, still never assigns anyone outside their own rankings", () => {
    const people = [person("alice", ["eng", "design"]), person("bob", ["design", "eng"])];
    const groups = [group("eng", 1, ["bob"]), group("design", 1, ["alice"])];
    const result = runOptimalAssignment(people, groups, { priority: "balanced" });
    for (const a of result.assignments) {
      const p = people.find((person) => person.id === a.personId)!;
      expect(a.groupId === null || p.rankings.includes(a.groupId)).toBe(true);
    }
    expect(result.assignments.filter((a) => a.groupId !== null)).toHaveLength(2);
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
  it("finds the next-best group if the assigned group were removed", () => {
    const people = [person("alice", ["eng", "design"]), person("bob", ["design"])];
    const groups = [group("eng", 1), group("design", 1)];
    const result = runGaleShapley(people, groups);
    const alternatives = computeAlternatives(people, groups, result.assignments);
    expect(alternatives.get("alice")).toBe("design");
  });

  it("maps unmatched people to null", () => {
    const people = [person("alice", ["eng"])];
    const groups = [group("eng", 0)];
    const result = runGaleShapley(people, groups);
    const alternatives = computeAlternatives(people, groups, result.assignments);
    expect(alternatives.get("alice")).toBeNull();
  });
});
