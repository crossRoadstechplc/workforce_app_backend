import { describe, expect, it } from "vitest";
import { workDateFromKey } from "../../shared/work-date.js";
import {
  isExactWorksheetCopy,
  normalizeWorksheetDescription,
  worksheetCopyLookbackFromKey
} from "./worksheet-duplicate.js";

describe("normalizeWorksheetDescription", () => {
  it("trims, collapses whitespace, and lowercases", () => {
    expect(normalizeWorksheetDescription("  Fixed  Bugs\nToday  ")).toBe("fixed bugs today");
  });
});

describe("isExactWorksheetCopy", () => {
  it("detects exact copies ignoring case and spacing", () => {
    expect(isExactWorksheetCopy("Fixed bugs today", "fixed  bugs   today")).toBe(true);
    expect(isExactWorksheetCopy("Fixed bugs today", "Fixed bugs yesterday")).toBe(false);
  });

  it("ignores empty descriptions", () => {
    expect(isExactWorksheetCopy("   ", "hello")).toBe(false);
    expect(isExactWorksheetCopy("hello", "  ")).toBe(false);
  });
});

describe("worksheetCopyLookbackFromKey", () => {
  it("starts two calendar days before the work date", () => {
    expect(worksheetCopyLookbackFromKey(workDateFromKey("2026-09-28"))).toBe("2026-09-26");
  });
});
