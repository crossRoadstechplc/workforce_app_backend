import { Router } from "express";
import { authenticate, requireNormalSession, requireOrgAdmin, requireOrgContext, requirePermission } from "../../middleware/authenticate.js";
import { changeDepartmentStatus, createDepartment, getDepartment, listDepartments, updateDepartment } from "./department.controller.js";

export const departmentAdminRouter = Router();
departmentAdminRouter.use(authenticate, requireNormalSession, requireOrgContext);
departmentAdminRouter.get("/", requirePermission("department.manage"), listDepartments);
departmentAdminRouter.get("/:departmentId", requirePermission("department.manage"), getDepartment);
departmentAdminRouter.post("/", requireOrgAdmin, requirePermission("department.manage"), createDepartment);
departmentAdminRouter.patch("/:departmentId", requireOrgAdmin, requirePermission("department.manage"), updateDepartment);
departmentAdminRouter.patch("/:departmentId/status", requireOrgAdmin, requirePermission("department.manage"), changeDepartmentStatus);
