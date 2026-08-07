import type { RequestHandler } from "express";
import type { ZodType } from "zod";
export const validate = (schema: ZodType): RequestHandler => async (req, _res, next) => {
  try { const parsed = await schema.parseAsync({ body: req.body, query: req.query, params: req.params }); req.body = parsed.body ?? req.body; req.query = parsed.query ?? req.query; req.params = parsed.params ?? req.params; next(); } catch (error) { next(error); }
};
