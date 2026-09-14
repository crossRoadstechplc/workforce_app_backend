import "dotenv/config";
import { describe, expect, it } from "vitest";
import { getAndroidAppVersion } from "./app-version.service.js";

describe("getAndroidAppVersion", () => {
  it("returns the Android version payload from env", () => {
    const payload = getAndroidAppVersion();
    expect(payload.platform).toBe("ANDROID");
    expect(payload.androidVersion).toMatch(/^\d+\.\d+/);
    expect(typeof payload.forceUpdate).toBe("boolean");
  });
});
