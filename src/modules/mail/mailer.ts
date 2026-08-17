import nodemailer from "nodemailer";
import { env } from "../../config/env.js";
import { logger } from "../../config/logger.js";
import { AppError } from "../../shared/errors/app-error.js";

export function isMailConfigured() {
  return Boolean(env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS);
}

function mailErrorDetails(error: unknown) {
  if (!(error instanceof Error)) return { error: String(error) };
  const extra = error as Error & {
    code?: string;
    command?: string;
    response?: string;
    responseCode?: number;
    errno?: number;
    syscall?: string;
    address?: string;
    port?: number;
  };
  return {
    message: extra.message,
    code: extra.code,
    command: extra.command,
    response: extra.response,
    responseCode: extra.responseCode,
    errno: extra.errno,
    syscall: extra.syscall,
    address: extra.address,
    port: extra.port,
    name: extra.name
  };
}

export function mailConfigSummary() {
  return {
    configured: isMailConfigured(),
    host: env.SMTP_HOST ?? null,
    port: env.SMTP_PORT,
    secure: env.SMTP_PORT === 465,
    user: env.SMTP_USER ?? null,
    from: env.SMTP_FROM,
    adminPortalUrl: env.ADMIN_PORTAL_URL,
    hasPassword: Boolean(env.SMTP_PASS)
  };
}

let transporter: nodemailer.Transporter | null = null;

function getTransporter() {
  if (!isMailConfigured()) {
    logger.error(mailConfigSummary(), "SMTP is not configured — invite emails will not send");
    throw new AppError(503, "EMAIL_NOT_CONFIGURED", "Email is not configured. Set SMTP_HOST, SMTP_USER, and SMTP_PASS.");
  }
  if (!transporter) {
    logger.info(mailConfigSummary(), "Creating SMTP transporter");
    transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_PORT === 465,
      auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
      connectionTimeout: 15_000,
      greetingTimeout: 15_000,
      socketTimeout: 20_000
    });
  }
  return transporter;
}

export async function logMailStartup() {
  const summary = mailConfigSummary();
  if (!summary.configured) {
    logger.warn(summary, "SMTP env vars missing — emails will fail until SMTP_HOST, SMTP_USER, and SMTP_PASS are set");
    return;
  }
  logger.info(summary, "SMTP env vars present — verifying connection");
  if (/localhost|127\.0\.0\.1/i.test(env.ADMIN_PORTAL_URL)) {
    logger.warn(
      { adminPortalUrl: env.ADMIN_PORTAL_URL },
      "ADMIN_PORTAL_URL points at localhost — invite buttons will not work for people outside this machine. Set a public https URL before sending real invites."
    );
  }
  try {
    await getTransporter().verify();
    logger.info({ host: summary.host, port: summary.port }, "SMTP connection verified");
  } catch (error) {
    logger.error(mailErrorDetails(error), "SMTP connection verify failed");
  }
}

export async function sendMail(to: string, subject: string, html: string, text?: string) {
  logger.info({ to, subject, from: env.SMTP_FROM, host: env.SMTP_HOST, port: env.SMTP_PORT }, "Sending email");
  try {
    const info = await getTransporter().sendMail({
      from: env.SMTP_FROM,
      to,
      subject,
      text: text?.trim() || html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(),
      html
    });
    logger.info(
      {
        to,
        subject,
        messageId: info.messageId,
        accepted: info.accepted,
        rejected: info.rejected,
        response: info.response,
        envelope: info.envelope
      },
      "Email sent"
    );
    return info;
  } catch (error) {
    logger.error({ to, subject, ...mailErrorDetails(error) }, "Email send failed");
    throw error;
  }
}
