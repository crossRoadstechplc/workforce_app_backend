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
    }
  }
}
export {};
