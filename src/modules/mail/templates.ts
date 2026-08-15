function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function layout(title: string, intro: string, buttonLabel: string, href: string, footer?: string) {
  return `<!DOCTYPE html>
<html>
  <body style="margin:0;padding:0;background:#f8fafc;font-family:Arial,sans-serif;color:#0f172a;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f8fafc;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="560" cellspacing="0" cellpadding="0" style="background:#ffffff;border:1px solid #e2e8f0;border-radius:16px;padding:32px;">
            <tr>
              <td>
                <p style="margin:0 0 8px;font-size:12px;letter-spacing:.16em;text-transform:uppercase;color:#2563eb;font-weight:700;">Workforce</p>
                <h1 style="margin:0 0 16px;font-size:24px;line-height:1.3;">${escapeHtml(title)}</h1>
                <p style="margin:0 0 24px;font-size:16px;line-height:1.6;color:#475569;">${intro}</p>
                <p style="margin:0 0 28px;">
                  <a href="${escapeHtml(href)}" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:10px;font-weight:700;">${escapeHtml(buttonLabel)}</a>
                </p>
                <p style="margin:0;font-size:13px;line-height:1.6;color:#64748b;">${footer ?? "If you were not expecting this email, you can ignore it."}</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

export function orgAdminInviteEmail(input: { companyName: string; href: string }) {
  const companyName = escapeHtml(input.companyName);
  return {
    subject: `You have been invited to ${input.companyName}`,
    html: layout(
      `Join ${input.companyName}`,
      `You have been invited as company administrator for <strong>${companyName}</strong>. Open the link below to set your password and sign in.`,
      "Set your password",
      input.href,
      "This link expires after a limited time. After you set a password, sign in to continue."
    )
  };
}

export function officeAdminInviteEmail(input: { companyName: string; officeNames: string; href: string }) {
  const companyName = escapeHtml(input.companyName);
  const officeNames = escapeHtml(input.officeNames);
  return {
    subject: `Office admin invite for ${input.companyName}`,
    html: layout(
      `Office administrator access`,
      `You have been invited as office administrator for <strong>${officeNames}</strong> at <strong>${companyName}</strong>. Open the link below to set your password and sign in.`,
      "Set your password",
      input.href,
      "This link expires after a limited time. After you set a password, sign in to continue."
    )
  };
}

export function employeeInviteEmail(input: { companyName: string; href: string }) {
  const companyName = escapeHtml(input.companyName);
  return {
    subject: `Complete your ${input.companyName} employee profile`,
    html: layout(
      `Complete your profile`,
      `<strong>${companyName}</strong> invited you to complete your employee profile. Open the form, enter your details, and choose a password to create your account.`,
      "Complete your profile",
      input.href,
      "This link expires after a limited time. After you finish, sign in with the employee app."
    )
  };
}
