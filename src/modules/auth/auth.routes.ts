import { Router } from "express";
import { authenticate } from "../../middleware/authenticate.js";
import { changePassword, login, logout, me, refresh } from "./auth.controller.js";
export const authRouter = Router();
authRouter.post("/login", login);
authRouter.post("/refresh", refresh);
authRouter.post("/change-password", authenticate, changePassword);
authRouter.post("/logout", authenticate, logout);
authRouter.get("/me", authenticate, me);
