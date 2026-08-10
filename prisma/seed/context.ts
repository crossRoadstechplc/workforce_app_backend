import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../src/generated/prisma/client.js";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
export const prisma = new PrismaClient({ adapter });

export type RoleIds = {
  superAdmin: string;
  orgAdmin: string;
  employee: string;
};

export type SeedContext = {
  prisma: PrismaClient;
  demoPasswordHash: string;
  superAdminEmail: string;
  superAdminPassword: string;
  roleIds: RoleIds;
};

export type ManifestEntry = {
  role: string;
  email: string;
  password: string;
  organization?: string;
  employeeCode?: string;
  notes?: string;
};

export const manifest: ManifestEntry[] = [];
