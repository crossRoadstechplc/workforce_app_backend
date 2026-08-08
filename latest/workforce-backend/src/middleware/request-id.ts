import { randomUUID } from "node:crypto";
import type { RequestHandler } from "express";
export const requestId: RequestHandler = (req, res, next) => { req.id = req.header("x-request-id") ?? randomUUID(); res.setHeader("x-request-id", req.id); next(); };
