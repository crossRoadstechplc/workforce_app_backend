import { v2 as cloudinary } from "cloudinary";
import { env } from "../config/env.js";
import { AppError } from "../shared/errors/app-error.js";

export function isCloudinaryConfigured() {
  return Boolean(env.CLOUDINARY_CLOUD_NAME && env.CLOUDINARY_API_KEY && env.CLOUDINARY_API_SECRET);
}

function ensureConfigured() {
  if (!isCloudinaryConfigured()) {
    throw new AppError(503, "CLOUDINARY_NOT_CONFIGURED", "Photo upload is not configured on this server");
  }
  cloudinary.config({
    cloud_name: env.CLOUDINARY_CLOUD_NAME,
    api_key: env.CLOUDINARY_API_KEY,
    api_secret: env.CLOUDINARY_API_SECRET,
    secure: true
  });
}

export function assertAttendancePhotoUrl(url: string) {
  if (!isCloudinaryConfigured()) return;
  const cloudName = env.CLOUDINARY_CLOUD_NAME!;
  const allowed = [
    `https://res.cloudinary.com/${cloudName}/`,
    `http://res.cloudinary.com/${cloudName}/`
  ];
  if (!allowed.some((prefix) => url.startsWith(prefix))) {
    throw new AppError(422, "INVALID_PHOTO_URL", "Photo URL must be hosted on the configured Cloudinary account");
  }
}

export async function uploadAttendancePhoto(input: {
  imageBase64: string;
  mimeType: string;
  purpose: "CHECK_IN" | "CHECK_OUT";
  employeeId: string;
}) {
  ensureConfigured();
  const folder = `${env.CLOUDINARY_UPLOAD_FOLDER}/${input.purpose.toLowerCase().replace("_", "-")}`;
  const dataUri = `data:${input.mimeType};base64,${input.imageBase64}`;
  const result = await cloudinary.uploader.upload(dataUri, {
    folder,
    public_id: `${input.employeeId}-${Date.now()}`,
    resource_type: "image",
    overwrite: false,
    transformation: [{ width: 960, height: 960, crop: "limit", quality: "auto:good", fetch_format: "auto" }]
  });
  return { url: result.secure_url, publicId: result.public_id };
}
