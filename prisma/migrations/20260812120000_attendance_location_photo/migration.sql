-- Attendance verification photos (Cloudinary URLs) for check-in / check-out
ALTER TABLE "attendance_locations" ADD COLUMN "photo_url" TEXT;
