import { describe, expect, it } from "vitest";
import { DEFAULT_PERMISSION_MATRIX } from "./default-matrix.js";
import { can } from "./permissions.js";
import { defaultPermissionRoleForAuth } from "./role-defaults.js";
import { ROLE, type AuthContext } from "../../shared/tenancy.js";

function auth(partial: Partial<AuthContext>): AuthContext {
  return {
    userId: "u1",
    roles: [],
    permissions: ["task_tracker.access"],
    restricted: false,
    organizationId: "org1",
    officeIds: [],
    ...partial
  };
}

describe("task-tracker roles", () => {
  it("maps workforce roles to tracker defaults", () => {
    expect(defaultPermissionRoleForAuth(auth({ roles: [ROLE.ORG_ADMIN] }))).toBe("ADMIN");
    expect(defaultPermissionRoleForAuth(auth({ roles: [ROLE.OFFICE_ADMIN] }))).toBe("LEAD");
    expect(defaultPermissionRoleForAuth(auth({ roles: [ROLE.EMPLOYEE] }))).toBe("JUNIOR_STAFF");
    expect(defaultPermissionRoleForAuth(auth({ roles: [ROLE.ORG_ADMIN] }), { enabler: true })).toBe(
      "SUPER_ADMIN"
    );
  });

  it("keeps Super Admin unrestricted and Junior Staff limited", () => {
    expect(can("Super Admin", "tasks.delete", DEFAULT_PERMISSION_MATRIX)).toBe(true);
    expect(can("Junior Staff", "tasks.delete", DEFAULT_PERMISSION_MATRIX)).toBe(false);
    expect(can("Junior Staff", "tasks.move", DEFAULT_PERMISSION_MATRIX)).toBe(true);
    expect(can("Admin", "settings.editPermissions", DEFAULT_PERMISSION_MATRIX)).toBe(true);
  });
});
