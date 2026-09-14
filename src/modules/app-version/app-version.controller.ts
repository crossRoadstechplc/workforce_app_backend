import type { RequestHandler } from "express";
import { getAndroidAppVersion } from "./app-version.service.js";

export const getAppVersion: RequestHandler = (_req, res) => {
  res.json(getAndroidAppVersion());
};
