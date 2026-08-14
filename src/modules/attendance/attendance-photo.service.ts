import { prisma } from "../../database/prisma.js";
import { assertAttendancePhotoUrl, isCloudinaryConfigured, uploadAttendancePhoto } from "../../lib/cloudinary.js";
import { AppError } from "../../shared/errors/app-error.js";
import { env } from "../../config/env.js";

async function employeeIdForUser(userId: string) {
  const employee = await prisma.employee.findFirst({ where: { userId }, select: { id: true } });
  if (!employee) throw new AppError(404, "EMPLOYEE_NOT_FOUND", "Employee profile not found");
  return employee.id;
}

export const attendancePhotoService = {
  isRequired() {
    return env.ATTENDANCE_PHOTO_REQUIRED && isCloudinaryConfigured();
  },

  async upload(
    userId: string,
    input: { imageBase64: string; mimeType: string; purpose: "CHECK_IN" | "CHECK_OUT" }
  ) {
    const employeeId = await employeeIdForUser(userId);
    const uploaded = await uploadAttendancePhoto({
      imageBase64: input.imageBase64,
      mimeType: input.mimeType,
      purpose: input.purpose,
      employeeId
    });
    return uploaded;
  },

  validatePhotoUrl(photoUrl?: string) {
    if (!attendancePhotoService.isRequired()) return;
    if (!photoUrl?.trim()) {
      throw new AppError(422, "PHOTO_REQUIRED", "A verification photo is required for this action");
    }
    assertAttendancePhotoUrl(photoUrl.trim());
  }
};
