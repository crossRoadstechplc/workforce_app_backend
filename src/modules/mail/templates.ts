function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export type MailContent = {
  subject: string;
  html: string;
  text: string;
};

function layout(input: {
  title: string;
  introHtml: string;
  introText: string;
  buttonLabel: string;
  href: string;
  footer: string;
}): Omit<MailContent, "subject"> {
  const href = escapeHtml(input.href);
  return {
    html: `<!DOCTYPE html>
<html>
  <body style="margin:0;padding:0;background:#f8fafc;font-family:Arial,Helvetica,sans-serif;color:#0f172a;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f8fafc;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="560" cellspacing="0" cellpadding="0" style="background:#ffffff;border:1px solid #e2e8f0;border-radius:16px;padding:32px;">
            <tr>
              <td>
                <p style="margin:0 0 8px;font-size:12px;letter-spacing:.16em;text-transform:uppercase;color:#2563eb;font-weight:700;">Workforce</p>
                <h1 style="margin:0 0 16px;font-size:24px;line-height:1.3;">${escapeHtml(input.title)}</h1>
                <p style="margin:0 0 24px;font-size:16px;line-height:1.6;color:#475569;">${input.introHtml}</p>
                <p style="margin:0 0 16px;">
                  <a href="${href}" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:10px;font-weight:700;">${escapeHtml(input.buttonLabel)}</a>
                </p>
                <p style="margin:0 0 8px;font-size:13px;line-height:1.6;color:#64748b;">If the button does not open, copy and paste this link into your browser:</p>
                <p style="margin:0 0 28px;font-size:13px;line-height:1.6;word-break:break-all;">
                  <a href="${href}" style="color:#2563eb;">${href}</a>
                </p>
                <p style="margin:0;font-size:13px;line-height:1.6;color:#64748b;">${escapeHtml(input.footer)}</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`,
    text: [
      input.title,
      "",
      input.introText,
      "",
      `${input.buttonLabel}:`,
      input.href,
      "",
      input.footer
    ].join("\n")
  };
}

export function orgAdminInviteEmail(input: {
  companyName: string;
  href: string;
  requiresPassword?: boolean;
}): MailContent {
  const companyName = input.companyName;
  const requiresPassword = input.requiresPassword !== false;
  return {
    subject: `${companyName} invited you as company administrator`,
    ...layout({
      title: `Join ${companyName}`,
      introHtml: requiresPassword
        ? `You have been invited as company administrator for <strong>${escapeHtml(companyName)}</strong>. Open the link below to set your password and sign in.`
        : `You have been invited as company administrator for <strong>${escapeHtml(companyName)}</strong>. You already have a Workforce account — open the link to confirm access, then sign in with your existing password.`,
      introText: requiresPassword
        ? `You have been invited as company administrator for ${companyName}. Open the link below to set your password and sign in.`
        : `You have been invited as company administrator for ${companyName}. You already have a Workforce account — open the link to confirm access, then sign in with your existing password.`,
      buttonLabel: requiresPassword ? "Set your password" : "Confirm access",
      href: input.href,
      footer: requiresPassword
        ? "This link expires after a limited time. After you set a password, sign in to continue. If you were not expecting this email, you can ignore it."
        : "This link expires after a limited time. Use your existing password to sign in. If you were not expecting this email, you can ignore it."
    })
  };
}

export function officeAdminInviteEmail(input: {
  companyName: string;
  officeNames: string;
  href: string;
  requiresPassword?: boolean;
}): MailContent {
  const { companyName, officeNames } = input;
  const requiresPassword = input.requiresPassword !== false;
  return {
    subject: `${companyName} invited you as office administrator`,
    ...layout({
      title: "Office administrator access",
      introHtml: requiresPassword
        ? `You have been invited as office administrator for <strong>${escapeHtml(officeNames)}</strong> at <strong>${escapeHtml(companyName)}</strong>. Open the link below to set your password and sign in.`
        : `Office administrator access for <strong>${escapeHtml(officeNames)}</strong> at <strong>${escapeHtml(companyName)}</strong> was added to your existing Workforce account. Open the link to confirm, then sign in with your existing password and choose Office Admin.`,
      introText: requiresPassword
        ? `You have been invited as office administrator for ${officeNames} at ${companyName}. Open the link below to set your password and sign in.`
        : `Office administrator access for ${officeNames} at ${companyName} was added to your existing Workforce account. Open the link to confirm, then sign in with your existing password and choose Office Admin.`,
      buttonLabel: requiresPassword ? "Set your password" : "Confirm access",
      href: input.href,
      footer: requiresPassword
        ? "This link expires after a limited time. After you set a password, sign in to continue. If you were not expecting this email, you can ignore it."
        : "This link expires after a limited time. Use your existing password to sign in. If you were not expecting this email, you can ignore it."
    })
  };
}

export function employeeInviteEmail(input: {
  companyName: string;
  href: string;
  requiresPassword?: boolean;
}): MailContent {
  const companyName = input.companyName;
  const requiresPassword = input.requiresPassword !== false;
  return {
    subject: `${companyName} invited you to complete your employee profile`,
    ...layout({
      title: "Complete your employee profile",
      introHtml: requiresPassword
        ? `<strong>${escapeHtml(companyName)}</strong> invited you to complete your employee profile. Open the form, enter your details, and choose a password to create your account.`
        : `<strong>${escapeHtml(companyName)}</strong> invited you to add an employee profile to your existing Workforce account. Open the form and enter your details — keep using your existing password.`,
      introText: requiresPassword
        ? `${companyName} invited you to complete your employee profile. Open the form, enter your details, and choose a password to create your account.`
        : `${companyName} invited you to add an employee profile to your existing Workforce account. Open the form and enter your details — keep using your existing password.`,
      buttonLabel: requiresPassword ? "Complete your profile" : "Continue",
      href: input.href,
      footer: requiresPassword
        ? "This link expires after a limited time. After you finish, sign in with the employee app. If you were not expecting this email, you can ignore it."
        : "This link expires after a limited time. Sign in with your existing password. If you were not expecting this email, you can ignore it."
    })
  };
}
