import { Router } from "express";
import { getAppVersion } from "./app-version.controller.js";

export const appVersionRouter = Router();
appVersionRouter.get("/version", getAppVersion);
