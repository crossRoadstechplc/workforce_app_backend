import { describe, expect, it } from "vitest";
import { canReCheckIn, isDayPermanentlyClosed } from "./flexible-day.logic.js";

describe("canReCheckIn", () => {
  it("allows re-entry after employee checkout", () => {
    expect(canReCheckIn({ isOpen: false, checkOutSource: "EMPLOYEE" })).toBe(true);
  });

  it("blocks when shift is still open", () => {
    expect(canReCheckIn({ isOpen: true, checkOutSource: null })).toBe(false);
  });

  it("blocks after system auto-checkout", () => {
    expect(canReCheckIn({ isOpen: false, checkOutSource: "SYSTEM" })).toBe(false);
  });

  it("blocks after admin correction close", () => {
    expect(canReCheckIn({ isOpen: false, checkOutSource: "ADMIN" })).toBe(false);
  });
});

describe("isDayPermanentlyClosed", () => {
  it("marks system and admin closes as permanent", () => {
    expect(isDayPermanentlyClosed({ isOpen: false, checkOutSource: "SYSTEM" })).toBe(true);
    expect(isDayPermanentlyClosed({ isOpen: false, checkOutSource: "ADMIN" })).toBe(true);
    expect(isDayPermanentlyClosed({ isOpen: false, checkOutSource: "EMPLOYEE" })).toBe(false);
    expect(isDayPermanentlyClosed({ isOpen: true, checkOutSource: null })).toBe(false);
  });
});
