import nodemailer from "nodemailer";
import { env } from "../../config/env.js";
import { AppError } from "../../shared/errors/app-error.js";

export function isMailConfigured() {
  return Boolean(env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS);
}

let transporter: nodemailer.Transporter | null = null;

function getTransporter() {
  if (!isMailConfigured()) {
    throw new AppError(503, "EMAIL_NOT_CONFIGURED", "Email is not configured. Set SMTP_HOST, SMTP_USER, and SMTP_PASS.");
  }
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_PORT === 465,
      auth: { user: env.SMTP_USER, pass: env.SMTP_PASS }
    });
  }
  return transporter;
}

export async function sendMail(to: string, subject: string, html: string) {
  await getTransporter().sendMail({
    from: env.SMTP_FROM,
    to,
    subject,
    html
  });
}
