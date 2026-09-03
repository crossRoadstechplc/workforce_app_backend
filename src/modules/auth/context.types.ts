export type ContextType = "platform" | "org_admin" | "office_admin" | "employee";

export type LoginContext = {
  key: string;
  type: ContextType;
  label: string;
  organizationId: string | null;
  organizationName: string | null;
  officeIds: string[];
  officeNames: string[];
};

export type ActiveContext = {
  key: string;
  type: ContextType;
  organizationId: string | null;
  officeIds: string[];
};

export const CONTEXT_PRIORITY: ContextType[] = ["platform", "org_admin", "office_admin", "employee"];

export const PORTAL_CONTEXT_TYPES: ContextType[] = ["platform", "org_admin", "office_admin"];

export function isPortalContextType(type: ContextType) {
  return PORTAL_CONTEXT_TYPES.includes(type);
}

export function buildContextKey(type: ContextType, organizationId?: string | null) {
  if (type === "platform") return "platform";
  if (!organizationId) throw new Error(`Organization id required for ${type} context`);
  return `${type}:${organizationId}`;
}

export function parseContextKey(key: string): { type: ContextType; organizationId: string | null } {
  if (key === "platform") return { type: "platform", organizationId: null };
  const [type, organizationId] = key.split(":");
  if (!type || !organizationId) throw new Error("Invalid context key");
  if (!["org_admin", "office_admin", "employee"].includes(type)) throw new Error("Invalid context type");
  return { type: type as ContextType, organizationId };
}

export function resolveDefaultContextKey(contexts: LoginContext[], lastUsedKey?: string | null) {
  if (lastUsedKey) {
    const last = contexts.find((item) => item.key === lastUsedKey);
    if (last) return last.key;
  }
  for (const type of CONTEXT_PRIORITY) {
    const match = contexts.find((item) => item.type === type);
    if (match) return match.key;
  }
  return contexts[0]?.key ?? null;
}
