import type { Request, RequestHandler } from "express";
import { attendanceService } from "./attendance.service.js";
const userId = (req: Request) => req.auth!.userId;
export const currentAttendance: RequestHandler = async (req,res,next)=>{ try { res.json({data:await attendanceService.current(userId(req))}); } catch(e){next(e);} };
export const previewCheckIn: RequestHandler = async (req,res,next)=>{ try { res.json({data:await attendanceService.preview(userId(req),req.body)}); } catch(e){next(e);} };
export const checkIn: RequestHandler = async (req,res,next)=>{ try { res.status(201).json({data:await attendanceService.checkIn(userId(req),req.body)}); } catch(e){next(e);} };
export const checkOut: RequestHandler = async (req,res,next)=>{ try { res.json({data:await attendanceService.checkOut(userId(req),req.body)}); } catch(e){next(e);} };
