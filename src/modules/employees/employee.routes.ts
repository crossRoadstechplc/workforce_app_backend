import { Router } from "express";
import { authenticate, requireNormalSession, requireOrgContext, requirePermission } from "../../middleware/authenticate.js";
import { changeEmployeeStatus, createEmployee, getEmployee, listEmployees, resetEmployeePassword, updateEmployee } from "./employee.controller.js";
import { createEmployeeInvite } from "../invites/invite.controller.js";
import { adjustEmployeeLeaveBalance, employeeLeaveBalance } from "../leave/leave.controller.js";
import { validate } from "../../shared/validate.js";
import { adjustLeaveBalanceSchema, employeeLeaveBalanceSchema } from "../leave/leave.schemas.js";

export const employeeAdminRouter = Router();
employeeAdminRouter.use(authenticate, requireNormalSession, requireOrgContext);
employeeAdminRouter.post("/", requirePermission("employee.create"), createEmployee);
employeeAdminRouter.post("/invites", requirePermission("employee.create"), createEmployeeInvite);
employeeAdminRouter.get("/", requirePermission("employee.view"), listEmployees);
employeeAdminRouter.get("/:employeeId/leave-balance", requirePermission("leave.view_all"), validate(employeeLeaveBalanceSchema), employeeLeaveBalance);
employeeAdminRouter.post("/:employeeId/leave-balance/adjust", requirePermission("leave.approve"), validate(adjustLeaveBalanceSchema), adjustEmployeeLeaveBalance);
employeeAdminRouter.get("/:employeeId", requirePermission("employee.view"), getEmployee);
employeeAdminRouter.patch("/:employeeId", requirePermission("employee.update"), updateEmployee);
employeeAdminRouter.patch("/:employeeId/status", requirePermission("employee.deactivate"), changeEmployeeStatus);
employeeAdminRouter.post("/:employeeId/reset-password", requirePermission("employee.update"), resetEmployeePassword);
