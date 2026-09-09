import { Router } from "express";
import { authenticate, requireNormalSession, requireOrgContext } from "../../middleware/authenticate.js";
import { validate } from "../../shared/validate.js";
import {
  consumeSessionExchange,
  createSessionExchange,
  getEvents,
  getMe,
  getNotifications,
  getWorkspace,
  importWorkspace,
  inviteStaff,
  patchNotificationRead,
  patchNotificationsReadAll,
  patchOrgTeam,
  patchProject,
  patchSchedule,
  patchStaff,
  patchStaffRole,
  patchTask,
  postArchiveTask,
  postMoveTask,
  postOrgTeam,
  postProject,
  postRestoreTrash,
  postSchedule,
  postTask,
  postTaskUpdate,
  putOrgTeamMembers,
  putPermissions,
  putProjectMembers,
  putWorkspace,
  removeOrgTeam,
  removeProject,
  removeSchedule,
  removeStaff,
  removeTask
} from "./controller.js";
import { requireTrackerMembership, requireTrackerPermission } from "./middleware.js";
import {
  addUpdateSchema,
  createOrgTeamSchema,
  createProjectSchema,
  createScheduleSchema,
  createTaskSchema,
  eventsQuerySchema,
  inviteStaffSchema,
  moveTaskSchema,
  notificationIdSchema,
  orgTeamMembersSchema,
  permissionsSchema,
  projectMembersSchema,
  restoreTrashSchema,
  taskIdSchema,
  updateOrgTeamSchema,
  updateProjectSchema,
  updateScheduleSchema,
  updateStaffRoleSchema,
  updateStaffSchema,
  updateTaskSchema,
  workspacePutSchema
} from "./schemas.js";

export const taskTrackerRouter = Router();

taskTrackerRouter.post("/session/consume", consumeSessionExchange);

taskTrackerRouter.use(authenticate, requireNormalSession, requireOrgContext);

taskTrackerRouter.post("/session/exchange", createSessionExchange);

taskTrackerRouter.use(requireTrackerMembership);

taskTrackerRouter.get("/me", getMe);
taskTrackerRouter.get("/workspace", getWorkspace);
taskTrackerRouter.put("/workspace", putWorkspace);
taskTrackerRouter.post("/workspace/import", requireTrackerPermission("backup.import"), validate(workspacePutSchema), importWorkspace);

taskTrackerRouter.put("/permissions", requireTrackerPermission("settings.editPermissions"), validate(permissionsSchema), putPermissions);

taskTrackerRouter.post("/tasks", requireTrackerPermission("tasks.create"), validate(createTaskSchema), postTask);
taskTrackerRouter.patch("/tasks/:id", requireTrackerPermission("tasks.edit"), validate(updateTaskSchema), patchTask);
taskTrackerRouter.delete("/tasks/:id", requireTrackerPermission("tasks.delete"), validate(taskIdSchema), removeTask);
taskTrackerRouter.post("/tasks/:id/updates", requireTrackerPermission("tasks.addUpdate"), validate(addUpdateSchema), postTaskUpdate);
taskTrackerRouter.post("/tasks/:id/move", requireTrackerPermission("tasks.move"), validate(moveTaskSchema), postMoveTask);
taskTrackerRouter.post("/tasks/:id/archive", requireTrackerPermission("tasks.delete"), validate(taskIdSchema), postArchiveTask);
taskTrackerRouter.post("/trash/:trashId/restore", requireTrackerPermission("trash.restore"), validate(restoreTrashSchema), postRestoreTrash);

taskTrackerRouter.post("/projects", requireTrackerPermission("projects.create"), validate(createProjectSchema), postProject);
taskTrackerRouter.patch("/projects/:id", requireTrackerPermission("projects.rename"), validate(updateProjectSchema), patchProject);
taskTrackerRouter.delete("/projects/:id", requireTrackerPermission("projects.delete"), validate(taskIdSchema), removeProject);
taskTrackerRouter.put("/projects/:id/members", requireTrackerPermission("projects.manageMembers"), validate(projectMembersSchema), putProjectMembers);

taskTrackerRouter.post("/org-teams", requireTrackerPermission("teams.create"), validate(createOrgTeamSchema), postOrgTeam);
taskTrackerRouter.patch("/org-teams/:id", requireTrackerPermission("teams.rename"), validate(updateOrgTeamSchema), patchOrgTeam);
taskTrackerRouter.delete("/org-teams/:id", requireTrackerPermission("teams.delete"), validate(taskIdSchema), removeOrgTeam);
taskTrackerRouter.put("/org-teams/:id/members", requireTrackerPermission("teams.manageMembers"), validate(orgTeamMembersSchema), putOrgTeamMembers);

taskTrackerRouter.post("/schedule", requireTrackerPermission("schedule.create"), validate(createScheduleSchema), postSchedule);
taskTrackerRouter.patch("/schedule/:id", requireTrackerPermission("schedule.edit"), validate(updateScheduleSchema), patchSchedule);
taskTrackerRouter.delete("/schedule/:id", requireTrackerPermission("schedule.delete"), validate(taskIdSchema), removeSchedule);

taskTrackerRouter.post("/staff/invite", requireTrackerPermission("staff.create"), validate(inviteStaffSchema), inviteStaff);
taskTrackerRouter.patch("/staff/:id", requireTrackerPermission("staff.edit"), validate(updateStaffSchema), patchStaff);
taskTrackerRouter.delete("/staff/:id", requireTrackerPermission("staff.delete"), validate(taskIdSchema), removeStaff);
taskTrackerRouter.patch("/staff/:id/role", requireTrackerPermission("staff.assignRole"), validate(updateStaffRoleSchema), patchStaffRole);

taskTrackerRouter.get("/notifications", getNotifications);
taskTrackerRouter.patch("/notifications/:id/read", validate(notificationIdSchema), patchNotificationRead);
taskTrackerRouter.patch("/notifications/read-all", patchNotificationsReadAll);

taskTrackerRouter.get("/events", validate(eventsQuerySchema), getEvents);
