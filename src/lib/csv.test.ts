import { describe, expect, it } from "vitest";
import { buildSessionEntities, exportAssignmentsCsv, parseGroupsCsv, parsePeopleCsv } from "./csv";

describe("parsePeopleCsv", () => {
  it("parses rows and skips a header starting with 'name'", () => {
    const csv = "name,rank1,rank2\nAlice,Engineering,Design\nBob,Design,Marketing";
    const { rows, errors } = parsePeopleCsv(csv);
    expect(errors).toEqual([]);
    expect(rows).toEqual([
      { name: "Alice", rankingNames: ["Engineering", "Design"] },
      { name: "Bob", rankingNames: ["Design", "Marketing"] },
    ]);
  });

  it("parses rows with no header present", () => {
    const csv = "Alice,Engineering,Design";
    const { rows } = parsePeopleCsv(csv);
    expect(rows).toEqual([{ name: "Alice", rankingNames: ["Engineering", "Design"] }]);
  });

  it("errors on a row missing a name", () => {
    const csv = "name,rank1\n,Engineering";
    const { rows, errors } = parsePeopleCsv(csv);
    expect(rows).toEqual([]);
    expect(errors[0]).toMatch(/missing person name/);
  });
});

describe("parseGroupsCsv", () => {
  it("parses name, capacity, and ranking columns", () => {
    const csv = "name,capacity,rank1,rank2\nEngineering,5,Alice,Carol\nDesign,3,Bob";
    const { rows, errors } = parseGroupsCsv(csv);
    expect(errors).toEqual([]);
    expect(rows).toEqual([
      { name: "Engineering", capacity: 5, rankingNames: ["Alice", "Carol"] },
      { name: "Design", capacity: 3, rankingNames: ["Bob"] },
    ]);
  });

  it("treats missing ranking columns as indifferent", () => {
    const csv = "name,capacity\nEngineering,5";
    const { rows } = parseGroupsCsv(csv);
    expect(rows).toEqual([{ name: "Engineering", capacity: 5, rankingNames: [] }]);
  });

  it("errors on an invalid capacity", () => {
    const csv = "name,capacity\nEngineering,not-a-number";
    const { rows, errors } = parseGroupsCsv(csv);
    expect(rows).toEqual([]);
    expect(errors[0]).toMatch(/invalid capacity/);
  });
});

describe("buildSessionEntities", () => {
  it("links people and groups by name into id-based rankings", () => {
    const { people, groups, warnings } = buildSessionEntities(
      [{ name: "Alice", rankingNames: ["Engineering", "Design"] }],
      [{ name: "Engineering", capacity: 5, rankingNames: ["Alice"] }, { name: "Design", capacity: 3, rankingNames: [] }],
    );
    expect(warnings).toEqual([]);
    const alice = people.find((p) => p.name === "Alice")!;
    const engineering = groups.find((g) => g.name === "Engineering")!;
    const design = groups.find((g) => g.name === "Design")!;
    expect(alice.rankings).toEqual([engineering.id, design.id]);
    expect(engineering.rankings).toEqual([alice.id]);
  });

  it("warns on unknown group and person names referenced in rankings", () => {
    const { warnings } = buildSessionEntities(
      [{ name: "Alice", rankingNames: ["Ghost Group"] }],
      [{ name: "Engineering", capacity: 5, rankingNames: ["Ghost Person"] }],
    );
    expect(warnings).toEqual(
      expect.arrayContaining([
        expect.stringContaining('unknown group "Ghost Group"'),
        expect.stringContaining('unknown person "Ghost Person"'),
      ]),
    );
  });

  it("warns and drops duplicate names", () => {
    const { people, warnings } = buildSessionEntities(
      [
        { name: "Alice", rankingNames: [] },
        { name: "Alice", rankingNames: [] },
      ],
      [],
    );
    expect(people).toHaveLength(1);
    expect(warnings).toEqual(expect.arrayContaining([expect.stringContaining('Duplicate person name "Alice"')]));
  });
});

describe("exportAssignmentsCsv", () => {
  it("produces a CSV with name, group, and rank achieved", () => {
    const { people, groups } = buildSessionEntities(
      [{ name: "Alice", rankingNames: ["Design", "Engineering"] }],
      [{ name: "Engineering", capacity: 5, rankingNames: [] }, { name: "Design", capacity: 3, rankingNames: [] }],
    );
    const alice = people[0];
    const design = groups.find((g) => g.name === "Design")!;
    const csv = exportAssignmentsCsv(people, groups, [{ personId: alice.id, groupId: design.id }]);
    expect(csv).toBe("name,group,rank_achieved\r\nAlice,Design,1");
  });

  it("leaves group and rank blank for unmatched people", () => {
    const { people, groups } = buildSessionEntities([{ name: "Alice", rankingNames: [] }], []);
    const csv = exportAssignmentsCsv(people, groups, [{ personId: people[0].id, groupId: null }]);
    expect(csv).toBe("name,group,rank_achieved\r\nAlice,,");
  });
});
