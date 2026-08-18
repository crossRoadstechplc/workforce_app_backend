import type { ErrorRequestHandler } from "express";
import { ZodError } from "zod";
import { AppError } from "../shared/errors/app-error.js";
import { logger } from "../config/logger.js";

function isPrismaKnownError(error: unknown): error is { code: string; meta?: unknown } {
  return typeof error === "object" && error !== null && "code" in error && typeof (error as { code?: unknown }).code === "string";
}

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  if (err instanceof ZodError) return res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Invalid request", details: err.flatten(), requestId: req.id } });
  if (err instanceof AppError) return res.status(err.statusCode).json({ error: { code: err.code, message: err.message, details: err.details, requestId: req.id } });
  if (isPrismaKnownError(err) && err.code === "P2002") return res.status(409).json({ error: { code: "DUPLICATE_RESOURCE", message: "A record with the same unique value already exists", details: err.meta, requestId: req.id } });
  if (isPrismaKnownError(err) && err.code === "P2025") return res.status(404).json({ error: { code: "RESOURCE_NOT_FOUND", message: "Requested resource was not found", requestId: req.id } });
  if (isPrismaKnownError(err) && err.code === "P2021") {
    return res.status(503).json({
      error: {
        code: "SCHEMA_MISSING",
        message: "Meeting/performance tables are missing. Run: npx prisma migrate deploy",
        details: err.meta,
        requestId: req.id
      }
    });
  }
  logger.error({ err, requestId: req.id }, "Unhandled error");
  return res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Unexpected server error", requestId: req.id } });
};
