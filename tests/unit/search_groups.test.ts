import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { parseSearchGroups } from "@/config/search_groups";

describe("search_groups config", () => {
  it("parses the repo config file", () => {
    const raw = readFileSync(path.join(process.cwd(), "config/search_groups.yaml"), "utf8");
    const groups = parseSearchGroups(raw);
    expect(groups.length).toBeGreaterThanOrEqual(1);
    for (const g of groups) {
      expect(g.name).toMatch(/\S/);
      expect(g.search_urls.length).toBeGreaterThan(0);
      expect(g.priority).toBeGreaterThanOrEqual(1);
    }
  });

  it("rejects invalid YAML", () => {
    expect(() => parseSearchGroups("not: [valid")).toThrow();
  });

  it("rejects missing fields", () => {
    expect(() => parseSearchGroups("- name: x")).toThrow();
  });
});
