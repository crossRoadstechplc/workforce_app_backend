import { env } from "../../config/env.js";

export function getAndroidAppVersion() {
  return {
    platform: "ANDROID" as const,
    androidVersion: env.ANDROID_APP_VERSION.trim(),
    forceUpdate: env.ANDROID_FORCE_UPDATE,
    releaseUrl: env.ANDROID_RELEASE_URL ?? null
  };
}
