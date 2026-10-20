import { describe, expect, it } from "vitest";
import {
  canSeeAllProjects,
  canSeeAllTasks,
  isTaskVisibleToViewer,
  taskEventRecipientStaffIds
} from "./visibility-policy.js";

describe("task-tracker visibility policy", () => {
  it("grants global project/task visibility to Super Admin and Admin only", () => {
    expect(canSeeAllProjects("Super Admin")).toBe(true);
    expect(canSeeAllProjects("Admin")).toBe(true);
    expect(canSeeAllProjects("Lead")).toBe(false);
    expect(canSeeAllTasks("Super Admin")).toBe(true);
    expect(canSeeAllTasks("Admin")).toBe(true);
    expect(canSeeAllTasks("Senior Staff")).toBe(false);
  });

  it("lets admins see every task", () => {
    expect(
      isTaskVisibleToViewer({
        viewerStaffMemberId: "admin-1",
        viewerRole: "Admin",
        ownerStaffMemberIds: ["other"],
        projectLeaderId: "lead-1"
      })
    ).toBe(true);
  });

  it("lets owners see their tasks and hides teammates' tasks", () => {
    expect(
      isTaskVisibleToViewer({
        viewerStaffMemberId: "me",
        viewerRole: "Junior Staff",
        ownerStaffMemberIds: ["me", "other"],
        projectLeaderId: "lead-1"
      })
    ).toBe(true);

    expect(
      isTaskVisibleToViewer({
        viewerStaffMemberId: "me",
        viewerRole: "Junior Staff",
        ownerStaffMemberIds: ["other"],
        projectLeaderId: "lead-1"
      })
    ).toBe(false);
  });

  it("lets project leaders see unassigned tasks only", () => {
    expect(
      isTaskVisibleToViewer({
        viewerStaffMemberId: "lead-1",
        viewerRole: "Lead",
        ownerStaffMemberIds: [],
        projectLeaderId: "lead-1"
      })
    ).toBe(true);

    expect(
      isTaskVisibleToViewer({
        viewerStaffMemberId: "member-1",
        viewerRole: "Senior Staff",
        ownerStaffMemberIds: [],
        projectLeaderId: "lead-1"
      })
    ).toBe(false);
  });

  it("does not treat project membership alone as task access when owners exist", () => {
    expect(
      isTaskVisibleToViewer({
        viewerStaffMemberId: "lead-1",
        viewerRole: "Lead",
        ownerStaffMemberIds: ["someone-else"],
        projectLeaderId: "lead-1"
      })
    ).toBe(false);
  });

  it("builds SSE recipient ids from owners or project leader when unassigned", () => {
    expect(taskEventRecipientStaffIds(["a", "b", "a"], "lead")).toEqual(["a", "b"]);
    expect(taskEventRecipientStaffIds([], "lead")).toEqual(["lead"]);
    expect(taskEventRecipientStaffIds([], null)).toEqual([]);
  });
});
