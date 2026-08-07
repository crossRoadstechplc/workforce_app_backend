import { Router } from "express";
import { authenticate, requireNormalSession, requirePermission } from "../../middleware/authenticate.js";
import { changeEmployeeStatus, createEmployee, getEmployee, listEmployees, resetEmployeePassword, updateEmployee } from "./employee.controller.js";

export const employeeAdminRouter = Router();
employeeAdminRouter.use(authenticate, requireNormalSession);
employeeAdminRouter.post("/", requirePermission("employee.create"), createEmployee);
employeeAdminRouter.get("/", requirePermission("employee.view"), listEmployees);
employeeAdminRouter.get("/:employeeId", requirePermission("employee.view"), getEmployee);
employeeAdminRouter.patch("/:employeeId", requirePermission("employee.update"), updateEmployee);
employeeAdminRouter.patch("/:employeeId/status", requirePermission("employee.deactivate"), changeEmployeeStatus);
employeeAdminRouter.post("/:employeeId/reset-password", requirePermission("employee.update"), resetEmployeePassword);
