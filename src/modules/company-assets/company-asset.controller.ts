import type { RequestHandler } from "express";
import { auditContextFromRequest } from "../../shared/audit.js";
import { getOfficeScope } from "../../shared/office-scope.js";
import { requireOrganizationId } from "../../shared/tenancy.js";
import { companyAssetService } from "./company-asset.service.js";
import {
  adminCompanyAssetListSchema,
  companyAssetIdSchema,
  createCompanyAssetSchema,
  declineCompanyAssetSchema,
  respondCompanyAssetSchema,
  returnCompanyAssetSchema,
  updateCompanyAssetSchema
} from "./company-asset.schemas.js";

const paramId = (value: string | string[] | undefined) => {
  const raw = Array.isArray(value) ? value[0] : value;
  return companyAssetIdSchema.parse({ id: raw }).id;
};

export const myCompanyAssets: RequestHandler = async (req, res, next) => {
  try {
    res.json({ data: await companyAssetService.mine(req.auth!.userId) });
  } catch (error) {
    next(error);
  }
};

export const acceptCompanyAsset: RequestHandler = async (req, res, next) => {
  try {
    const body = respondCompanyAssetSchema.parse(req.body ?? {});
    res.json({ data: await companyAssetService.respond(req.auth!.userId, paramId(req.params.id), "ACCEPTED", body.note) });
  } catch (error) {
    next(error);
  }
};

export const declineCompanyAsset: RequestHandler = async (req, res, next) => {
  try {
    const body = declineCompanyAssetSchema.parse(req.body ?? {});
    res.json({ data: await companyAssetService.respond(req.auth!.userId, paramId(req.params.id), "DECLINED", body.note) });
  } catch (error) {
    next(error);
  }
};

export const adminCompanyAssets: RequestHandler = async (req, res, next) => {
  try {
    const query = adminCompanyAssetListSchema.parse(req.query);
    res.json({ data: await companyAssetService.adminList(requireOrganizationId(req.auth), query, getOfficeScope(req.auth)) });
  } catch (error) {
    next(error);
  }
};

export const createCompanyAsset: RequestHandler = async (req, res, next) => {
  try {
    const body = createCompanyAssetSchema.parse(req.body);
    const [asset] = await companyAssetService.assignMany(
      requireOrganizationId(req.auth),
      body.employeeId,
      [body],
      auditContextFromRequest(req),
      getOfficeScope(req.auth)
    );
    res.status(201).json({ data: asset });
  } catch (error) {
    next(error);
  }
};

export const updateCompanyAsset: RequestHandler = async (req, res, next) => {
  try {
    const body = updateCompanyAssetSchema.parse(req.body);
    res.json({
      data: await companyAssetService.update(
        requireOrganizationId(req.auth),
        paramId(req.params.id),
        body,
        auditContextFromRequest(req),
        getOfficeScope(req.auth)
      )
    });
  } catch (error) {
    next(error);
  }
};

export const returnCompanyAsset: RequestHandler = async (req, res, next) => {
  try {
    const body = returnCompanyAssetSchema.parse(req.body ?? {});
    res.json({
      data: await companyAssetService.markReturned(
        requireOrganizationId(req.auth),
        paramId(req.params.id),
        body.note,
        auditContextFromRequest(req),
        getOfficeScope(req.auth)
      )
    });
  } catch (error) {
    next(error);
  }
};

export const deleteCompanyAsset: RequestHandler = async (req, res, next) => {
  try {
    res.json({
      data: await companyAssetService.remove(
        requireOrganizationId(req.auth),
        paramId(req.params.id),
        auditContextFromRequest(req),
        getOfficeScope(req.auth)
      )
    });
  } catch (error) {
    next(error);
  }
};
