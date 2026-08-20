import { Router } from "express";
import rateLimit from "express-rate-limit";
import { authenticate, authenticateDisplay, requireNormalSession, requireOrgAdmin, requireOrgContext, requirePermission } from "../../middleware/authenticate.js";
import { validate } from "../../shared/validate.js";
import {
  adminCreateDisplay,
  adminListDisplays,
  adminRePairDisplay,
  adminRevokeDisplay,
  displayPeople,
  displayRooms,
  pairDisplay,
  refreshDisplay
} from "./display.controller.js";
import { createDisplaySchema, displayIdSchema, pairDisplaySchema, refreshDisplaySchema, roomsBoardSchema } from "./display.schemas.js";

const pairLimiter = rateLimit({
  windowMs: 60_000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.method === "OPTIONS"
});

export const displayRouter = Router();
displayRouter.post("/pair", pairLimiter, validate(pairDisplaySchema), pairDisplay);
displayRouter.post("/refresh", validate(refreshDisplaySchema), refreshDisplay);
displayRouter.get("/rooms", authenticateDisplay, validate(roomsBoardSchema), displayRooms);
displayRouter.get("/people", authenticateDisplay, displayPeople);

export const adminDisplayRouter = Router();
adminDisplayRouter.use(authenticate, requireNormalSession, requireOrgContext, requireOrgAdmin);
adminDisplayRouter.get("/", requirePermission("display.manage"), adminListDisplays);
adminDisplayRouter.post("/", requirePermission("display.manage"), validate(createDisplaySchema), adminCreateDisplay);
adminDisplayRouter.post("/:id/re-pair", requirePermission("display.manage"), validate(displayIdSchema), adminRePairDisplay);
adminDisplayRouter.post("/:id/revoke", requirePermission("display.manage"), validate(displayIdSchema), adminRevokeDisplay);
