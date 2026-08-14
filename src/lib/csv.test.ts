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

describe("parsePeopleCsv — forms export", () => {
  it("converts a Microsoft/Google Forms preference-survey export into person rows", () => {
    const csv = [
      "Id,Start time,Completion time,Email,Name,What is your FIRST choice team?,What is your SECOND choice team?,What is your THIRD choice team?",
      "1,8/6/2026 12:49,8/6/2026 12:51,dina.bee@target.com,dina bee,Finance,Nova,Outbound",
      "2,8/6/2026 12:24,8/6/2026 15:44,carson.tanner@target.com,carson tanner,Nova,Outbound,Finance",
    ].join("\n");
    const { rows, errors } = parsePeopleCsv(csv);
    expect(errors).toEqual([]);
    expect(rows).toEqual([
      { name: "dina bee", rankingNames: ["Finance", "Nova", "Outbound"] },
      { name: "carson tanner", rankingNames: ["Nova", "Outbound", "Finance"] },
    ]);
  });
});

describe("parseGroupsCsv — forms export", () => {
  it("converts a manager preference-survey export into group rows with capacity 1 per respondent", () => {
    const csv = [
      "Id,Start time,Completion time,Email,Name,Which team are you ranking your preferences for?,Please select your 1st choice TLP,Please select your 2nd choice TLP",
      "1,8/4/2026 12:30,8/4/2026 12:32,james.ess@target.com,james ess,Outbound,wavy june,dina bee",
      "2,8/5/2026 15:28,8/5/2026 15:29,benson.callahan@target.com,benson callahan,Nova,carson tanner,dina bee",
    ].join("\n");
    const { rows, errors } = parseGroupsCsv(csv);
    expect(errors).toEqual([]);
    expect(rows).toEqual([
      { name: "Outbound", capacity: 1, rankingNames: ["wavy june", "dina bee"] },
      { name: "Nova", capacity: 1, rankingNames: ["carson tanner", "dina bee"] },
    ]);
  });

  it("merges multiple respondents ranking the same team into one group with summed capacity", () => {
    const csv = [
      "Id,Start time,Completion time,Email,Name,Which team are you ranking your preferences for?,Please select your 1st choice TLP,Please select your 2nd choice TLP",
      "1,8/4/2026 12:30,8/4/2026 12:32,a@x.com,a,Outbound,wavy june,dina bee",
      "2,8/5/2026 15:28,8/5/2026 15:29,b@x.com,b,Outbound,dina bee,carson tanner",
    ].join("\n");
    const { rows } = parseGroupsCsv(csv);
    expect(rows).toEqual([{ name: "Outbound", capacity: 2, rankingNames: ["wavy june", "dina bee", "carson tanner"] }]);
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
