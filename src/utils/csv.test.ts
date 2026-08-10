import { describe, expect, it } from "vitest";
import { parseDelimitedText, rowsToCsv } from "./csv";

describe("parseDelimitedText", () => {
  it("parses standard CSV rows", () => {
    const result = parseDelimitedText(
      "source,target,value\n样本,组A,120\n样本,组B,80",
    );

    expect(result.errors).toEqual([]);
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]).toMatchObject({
      source: "样本",
      target: "组A",
      value: 120,
    });
  });

  it("accepts Chinese headers and tab delimiters", () => {
    const result = parseDelimitedText("来源\t目标\t值\n队列\t缓解\t42");

    expect(result.errors).toEqual([]);
    expect(result.rows[0].value).toBe(42);
  });

  it("reports invalid non-positive values", () => {
    const result = parseDelimitedText("source,target,value\nA,B,0");

    expect(result.rows).toHaveLength(0);
    expect(result.errors[0]).toContain("大于 0");
  });

  it("imports optional node and link groups", () => {
    const result = parseDelimitedText(
      "source,target,value,source_group,target_group,link_group\nA,B,3,入口,处理,路径一",
    );

    expect(result.errors).toEqual([]);
    expect(result.rows[0]).toMatchObject({
      sourceGroup: "入口",
      targetGroup: "处理",
      linkGroup: "路径一",
    });
  });
});

describe("rowsToCsv", () => {
  it("quotes labels containing commas", () => {
    const csv = rowsToCsv([
      { id: "1", source: "A, first", target: "B", value: 4 },
    ]);

    expect(csv).toContain('"A, first",B,4');
  });

  it("preserves optional groups when exporting", () => {
    const csv = rowsToCsv([
      {
        id: "1",
        source: "A",
        target: "B",
        value: 4,
        sourceGroup: "入口",
        targetGroup: "处理",
        linkGroup: "主路径",
      },
    ]);

    expect(csv).toContain("source_group,target_group,link_group");
    expect(csv).toContain("入口,处理,主路径");
  });
});
