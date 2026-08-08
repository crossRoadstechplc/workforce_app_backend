import type { RequestHandler } from "express";
import type { ZodType } from "zod";

type ValidatedParts = {
  body?: unknown;
  query?: unknown;
  params?: unknown;
};

function replaceRequestProperty(req: object, key: "query" | "params", value: unknown) {
  Object.defineProperty(req, key, {
    value,
    writable: true,
    configurable: true,
    enumerable: true
  });
}

export const validate = (schema: ZodType): RequestHandler => async (req, _res, next) => {
  try {
    const parsed = await schema.parseAsync({ body: req.body, query: req.query, params: req.params }) as ValidatedParts;
    if (parsed.body !== undefined) req.body = parsed.body;
    if (parsed.query !== undefined) replaceRequestProperty(req, "query", parsed.query);
    if (parsed.params !== undefined) replaceRequestProperty(req, "params", parsed.params);
    (req as { validated?: ValidatedParts }).validated = parsed;
    next();
  } catch (error) {
    next(error);
  }
};
