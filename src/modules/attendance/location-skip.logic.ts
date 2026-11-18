export type ClientChannel = "MOBILE" | "DESKTOP";
export type DevicePlatform = "IOS" | "ANDROID" | "OTHER";
export type SkippedLocationSource = "DESKTOP" | "IOS";
export type LocationSkipSettings = { desktopSkipLocationEnabled: boolean; iosSkipLocationEnabled: boolean };

/** iPhone / iPad / iPod: native app or any iOS browser (all iOS browsers are WebKit/Safari). */
const IOS_USER_AGENT = /\b(iPhone|iPad|iPod)\b/i;

/** The explicit client hint wins; the User-Agent is only a fallback for clients that do not send it. */
export function isIosDevice(input: { devicePlatform?: DevicePlatform; userAgent?: string }) {
  if (input.devicePlatform) return input.devicePlatform === "IOS";
  return Boolean(input.userAgent && IOS_USER_AGENT.test(input.userAgent));
}

/**
 * Returns the source to record when location may be skipped, or null when GPS is required.
 * The platform hint and User-Agent are client-controlled, so skipped records are tagged
 * (source DESKTOP / IOS) for admin review instead of being trusted blindly.
 */
export function locationSkipSource(
  input: { clientChannel: ClientChannel; devicePlatform?: DevicePlatform; userAgent?: string },
  settings: LocationSkipSettings
): SkippedLocationSource | null {
  if (settings.iosSkipLocationEnabled && isIosDevice(input)) return "IOS";
  if (input.clientChannel === "DESKTOP" && settings.desktopSkipLocationEnabled) return "DESKTOP";
  return null;
}
