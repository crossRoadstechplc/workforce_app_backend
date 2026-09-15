import { describe, expect, it } from "vitest";
import { checkOutSchema, normalizeAttendanceClientChannel, previewCheckInSchema } from "./attendance.schemas.js";

describe("normalizeAttendanceClientChannel", () => {
  it("maps WEB and desktop OS names to DESKTOP", () => {
    expect(normalizeAttendanceClientChannel("WEB")).toBe("DESKTOP");
    expect(normalizeAttendanceClientChannel("web")).toBe("DESKTOP");
    expect(normalizeAttendanceClientChannel(" windows ")).toBe("DESKTOP");
    expect(normalizeAttendanceClientChannel("LINUX")).toBe("DESKTOP");
    expect(normalizeAttendanceClientChannel("macOS")).toBe("DESKTOP");
  });

  it("maps phone platforms to MOBILE", () => {
    expect(normalizeAttendanceClientChannel("ANDROID")).toBe("MOBILE");
    expect(normalizeAttendanceClientChannel("ios")).toBe("MOBILE");
  });

  it("keeps canonical channels", () => {
    expect(normalizeAttendanceClientChannel("MOBILE")).toBe("MOBILE");
    expect(normalizeAttendanceClientChannel("DESKTOP")).toBe("DESKTOP");
  });
});

describe("attendance schemas accept WEB", () => {
  it("parses check-out with WEB as DESKTOP", () => {
    const parsed = checkOutSchema.parse({
      body: { clientChannel: "WEB", idempotencyKey: "11111111-1111-4111-8111-111111111111" }
    });
    expect(parsed.body.clientChannel).toBe("DESKTOP");
  });

  it("parses preview with DESKTOP unchanged", () => {
    const parsed = previewCheckInSchema.parse({ body: { clientChannel: "DESKTOP" } });
    expect(parsed.body.clientChannel).toBe("DESKTOP");
  });

  it("rejects unknown channels", () => {
    expect(() => previewCheckInSchema.parse({ body: { clientChannel: "TABLET" } })).toThrow();
  });
});
