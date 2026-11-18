declare global {
  namespace Express {
    interface Request {
      id: string;
      auth?: {
        userId: string;
        roles: string[];
        permissions: string[];
        restricted: boolean;
        organizationId: string | null;
        officeIds: string[];
        activeContext?: {
          key: string;
          type: "platform" | "org_admin" | "office_admin" | "employee";
          organizationId: string | null;
          officeIds: string[];
        };
        typ?: "access" | "display";
        boardMode?: "ROOMS" | "PEOPLE" | "BOTH";
      };
      vault?: {
        userId: string;
        organizationId: string;
        scope: "credentials" | "subscriptions" | "reveal";
      };
      display?: {
        displayId: string;
        organizationId: string;
        officeId: string;
        boardMode: "ROOMS" | "PEOPLE" | "BOTH";
        permissions: string[];
      };
      /** Set by authenticateApiKey for the external integration API. */
      integration?: {
        integrationId: string;
        organizationId: string;
        /** Empty = all offices. */
        officeIds: string[];
        name: string;
      };
      tracker?: {
        workspaceId: string;
        staffMemberId: string;
        permissionRole: "Super Admin" | "Admin" | "Lead" | "Senior Staff" | "Junior Staff";
        displayName: string;
      };
    }
  }
}
export {};
