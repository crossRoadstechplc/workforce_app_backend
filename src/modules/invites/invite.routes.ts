import { Router } from "express";
import rateLimit from "express-rate-limit";
import { authenticate, requireNormalSession } from "../../middleware/authenticate.js";
import { acceptAdminInvite, acceptEmployeeInvite, getInvite, listInvites, resendInvite } from "./invite.controller.js";

const publicLimiter = rateLimit({
  windowMs: 60_000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.method === "OPTIONS"
});

export const publicInviteRouter = Router();
publicInviteRouter.use(publicLimiter);
publicInviteRouter.get("/:token", getInvite);
publicInviteRouter.post("/:token/accept-admin", acceptAdminInvite);
publicInviteRouter.post("/:token/accept-employee", acceptEmployeeInvite);

export const adminInviteRouter = Router();
adminInviteRouter.use(authenticate, requireNormalSession);
adminInviteRouter.get("/", listInvites);
adminInviteRouter.post("/:id/resend", resendInvite);
