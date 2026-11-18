import { describe, expect, it } from "vitest";
import { apiKeyPreview, generateApiKey, hashApiKey, parseApiKey } from "./api-key.js";
import {
  isPrivateAddress,
  nextRetryDelayMs,
  signWebhookPayload,
  verifyWebhookSignature,
  WEBHOOK_MAX_ATTEMPTS,
  webhookUrlProblem
} from "./webhook-signature.js";
import { externalIdReplay, officeAllowed, toExternalBooking } from "./meetings-api.logic.js";
import { apiCreateBookingSchema, apiRescheduleBookingSchema } from "./meetings-api.schemas.js";

describe("API keys", () => {
  it("generates a parseable key whose hash matches", () => {
    const key = generateApiKey();
    expect(key.apiKey).toMatch(/^wfk_live_[0-9a-f]{8}_[A-Za-z0-9_-]{32}$/);
    const parsed = parseApiKey(`  ${key.apiKey} `);
    expect(parsed?.prefix).toBe(key.prefix);
    expect(hashApiKey(parsed!.apiKey)).toBe(key.hash);
    expect(apiKeyPreview(key.prefix)).toBe(`wfk_live_${key.prefix}_…`);
  });

  it("generates unique keys and rejects malformed ones", () => {
    expect(generateApiKey().apiKey).not.toBe(generateApiKey().apiKey);
    expect(parseApiKey("wfk_live_short")).toBeNull();
    expect(parseApiKey("Bearer abc")).toBeNull();
    expect(parseApiKey(undefined)).toBeNull();
  });
});

describe("webhook signatures", () => {
  const secret = "whsec_test";
  const body = JSON.stringify({ event: "booking.created", data: { id: "1" } });

  it("verifies a signature it produced", () => {
    const header = signWebhookPayload(secret, body, 1_700_000_000);
    expect(verifyWebhookSignature(secret, body, header, 1_700_000_010)).toBe(true);
  });

  it("rejects a tampered body, wrong secret, old timestamp or missing header", () => {
    const header = signWebhookPayload(secret, body, 1_700_000_000);
    expect(verifyWebhookSignature(secret, body.replace("1", "2"), header, 1_700_000_000)).toBe(false);
    expect(verifyWebhookSignature("whsec_other", body, header, 1_700_000_000)).toBe(false);
    expect(verifyWebhookSignature(secret, body, header, 1_700_000_000 + 3600)).toBe(false);
    expect(verifyWebhookSignature(secret, body, undefined)).toBe(false);
  });
});

describe("webhook retry schedule", () => {
  it("backs off 1m, 5m, 15m, 1h, 6h then gives up", () => {
    expect([1, 2, 3, 4, 5].map(nextRetryDelayMs)).toEqual([60_000, 300_000, 900_000, 3_600_000, 21_600_000]);
    expect(nextRetryDelayMs(WEBHOOK_MAX_ATTEMPTS)).toBeNull();
  });
});

describe("webhook URL safety", () => {
  it("requires public https in production", () => {
    expect(webhookUrlProblem("https://spx.example.com/hooks", { production: true })).toBeNull();
    expect(webhookUrlProblem("http://spx.example.com/hooks", { production: true })).toMatch(/https/);
    expect(webhookUrlProblem("https://localhost/hooks", { production: true })).toMatch(/public/);
    expect(webhookUrlProblem("https://192.168.1.10/hooks", { production: true })).toMatch(/public/);
    expect(webhookUrlProblem("https://user:pw@spx.example.com", { production: true })).toMatch(/credentials/);
    expect(webhookUrlProblem("not a url", { production: true })).toMatch(/valid/);
  });

  it("allows http://localhost only outside production", () => {
    expect(webhookUrlProblem("http://localhost:5050/hook", { production: false })).toBeNull();
    expect(webhookUrlProblem("http://spx.example.com/hook", { production: false })).toMatch(/https/);
  });

  it("detects private addresses", () => {
    for (const ip of ["127.0.0.1", "10.1.2.3", "172.20.0.1", "192.168.0.5", "169.254.1.1", "100.64.0.1", "::1", "fd00::1", "::ffff:10.0.0.1"]) {
      expect(isPrivateAddress(ip)).toBe(true);
    }
    for (const ip of ["8.8.8.8", "172.32.0.1", "2001:4860:4860::8888", "spx.example.com"]) {
      expect(isPrivateAddress(ip)).toBe(false);
    }
  });
});

describe("integration scope and replay rules", () => {
  it("empty office list means every office", () => {
    expect(officeAllowed([], "office-a")).toBe(true);
    expect(officeAllowed(["office-a"], "office-a")).toBe(true);
    expect(officeAllowed(["office-a"], "office-b")).toBe(false);
  });

  it("reuses an identical externalId request and flags a different one", () => {
    const base = { roomId: "r1", startsAt: new Date("2026-11-20T07:00:00Z"), endsAt: new Date("2026-11-20T08:00:00Z"), organizerEmployeeId: "e1" };
    expect(externalIdReplay(base, { ...base, startsAt: new Date("2026-11-20T10:00:00+03:00") })).toBe("REUSE");
    expect(externalIdReplay(base, { ...base, roomId: "r2" })).toBe("CONFLICT");
    expect(externalIdReplay(base, { ...base, organizerEmployeeId: "e2" })).toBe("CONFLICT");
  });

  it("serialises a booking for the external app", () => {
    const out = toExternalBooking({
      id: "b1",
      title: "Client meeting",
      notes: null,
      status: "BOOKED",
      source: "API",
      externalId: "SPX-1",
      startsAt: new Date("2026-11-20T07:00:00Z"),
      endsAt: new Date("2026-11-20T08:00:00Z"),
      createdAt: new Date("2026-11-19T07:00:00Z"),
      rescheduledAt: null,
      cancelledAt: null,
      cancelReason: null,
      room: { id: "r1", name: "Board room", location: null },
      office: { id: "o1", name: "HQ", timezone: "Africa/Addis_Ababa" },
      organizer: { employeeCode: "SPX001", firstName: "Abebe", lastName: "Kebede" }
    });
    expect(out.employee).toEqual({ employeeCode: "SPX001", name: "Abebe Kebede" });
    expect(out).not.toHaveProperty("bookedBy");
  });
});

describe("external API request validation", () => {
  const body = {
    employeeCode: " SPX001 ",
    roomId: "6f1c5c1e-8a4b-4c1e-9a55-2f4b1d3c9e10",
    title: "Client meeting",
    startsAt: "2026-11-20T10:00:00+03:00",
    endsAt: "2026-11-20T11:00:00+03:00"
  };

  it("accepts times with an offset and converts them to instants", () => {
    const parsed = apiCreateBookingSchema.parse({ body }).body;
    expect(parsed.employeeCode).toBe("SPX001");
    expect(parsed.startsAt.toISOString()).toBe("2026-11-20T07:00:00.000Z");
  });

  it("rejects times without a timezone offset", () => {
    expect(() => apiCreateBookingSchema.parse({ body: { ...body, startsAt: "2026-11-20T10:00:00" } })).toThrow(/offset/);
  });

  it("requires something to change on reschedule", () => {
    expect(() => apiRescheduleBookingSchema.parse({ params: { id: body.roomId }, body: {} })).toThrow();
    expect(apiRescheduleBookingSchema.parse({ params: { id: body.roomId }, body: { title: "New title" } }).body.title).toBe("New title");
  });
});
