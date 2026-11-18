import { describe, expect, it } from "vitest";
import { isIosDevice, locationSkipSource } from "./location-skip.logic.js";
import { checkInSchema, normalizeDevicePlatform } from "./attendance.schemas.js";

const IPHONE_SAFARI =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
const IPHONE_CHROME =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0.6478.54 Mobile/15E148 Safari/604.1";
const ANDROID_CHROME =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36";
const MAC_SAFARI =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15";

const allOff = { desktopSkipLocationEnabled: false, iosSkipLocationEnabled: false };
const iosOn = { desktopSkipLocationEnabled: false, iosSkipLocationEnabled: true };
const desktopOn = { desktopSkipLocationEnabled: true, iosSkipLocationEnabled: false };

describe("isIosDevice", () => {
  it("prefers the explicit devicePlatform hint", () => {
    expect(isIosDevice({ devicePlatform: "IOS" })).toBe(true);
    expect(isIosDevice({ devicePlatform: "ANDROID", userAgent: IPHONE_SAFARI })).toBe(false);
  });

  it("falls back to the User-Agent for any iOS browser", () => {
    expect(isIosDevice({ userAgent: IPHONE_SAFARI })).toBe(true);
    expect(isIosDevice({ userAgent: IPHONE_CHROME })).toBe(true);
    expect(isIosDevice({ userAgent: ANDROID_CHROME })).toBe(false);
    expect(isIosDevice({ userAgent: MAC_SAFARI })).toBe(false);
    expect(isIosDevice({})).toBe(false);
  });
});

describe("locationSkipSource", () => {
  it("requires location on iOS when the iOS toggle is off", () => {
    expect(locationSkipSource({ clientChannel: "MOBILE", devicePlatform: "IOS" }, allOff)).toBeNull();
    expect(locationSkipSource({ clientChannel: "MOBILE", devicePlatform: "IOS" }, desktopOn)).toBeNull();
  });

  it("skips location on iOS (as IOS) when the iOS toggle is on", () => {
    expect(locationSkipSource({ clientChannel: "MOBILE", devicePlatform: "IOS" }, iosOn)).toBe("IOS");
    expect(locationSkipSource({ clientChannel: "MOBILE", userAgent: IPHONE_SAFARI }, iosOn)).toBe("IOS");
  });

  it("never skips location for Android", () => {
    expect(locationSkipSource({ clientChannel: "MOBILE", devicePlatform: "ANDROID" }, iosOn)).toBeNull();
    expect(locationSkipSource({ clientChannel: "MOBILE", userAgent: ANDROID_CHROME }, { ...iosOn, desktopSkipLocationEnabled: true })).toBeNull();
  });

  it("keeps the existing desktop behaviour", () => {
    expect(locationSkipSource({ clientChannel: "DESKTOP", userAgent: MAC_SAFARI }, desktopOn)).toBe("DESKTOP");
    expect(locationSkipSource({ clientChannel: "DESKTOP", userAgent: MAC_SAFARI }, iosOn)).toBeNull();
  });
});

describe("devicePlatform schema field", () => {
  it("normalizes known values and ignores missing ones", () => {
    expect(normalizeDevicePlatform(" ios ")).toBe("IOS");
    expect(normalizeDevicePlatform("iPadOS")).toBe("IOS");
    expect(normalizeDevicePlatform("android")).toBe("ANDROID");
    expect(normalizeDevicePlatform("windows")).toBe("OTHER");
    expect(normalizeDevicePlatform(undefined)).toBeUndefined();
  });

  it("is optional on check-in", () => {
    const base = { clientChannel: "MOBILE", idempotencyKey: "6f1c5c1e-8a4b-4c1e-9a55-2f4b1d3c9e10" };
    expect(checkInSchema.parse({ body: base }).body.devicePlatform).toBeUndefined();
    expect(checkInSchema.parse({ body: { ...base, devicePlatform: "ios" } }).body.devicePlatform).toBe("IOS");
  });
});
