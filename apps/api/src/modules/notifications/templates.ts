/**
 * Inline email templates. Brand styling must work in every major email client,
 * which means tables, inline CSS, and no flexbox. Keep it simple.
 */

const wrap = (body: string) => `
<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#F5F3FF;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
    <table width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr><td align="center" style="padding:32px 16px;">
        <table width="520" cellpadding="0" cellspacing="0" border="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 12px rgba(76,29,149,0.08);">
          <tr><td style="background:linear-gradient(180deg,#6D28D9 0%,#4C1D95 100%);padding:24px;">
            <div style="color:#ffffff;font-size:22px;font-weight:800;letter-spacing:-0.5px;">Orkora</div>
          </td></tr>
          <tr><td style="padding:32px 28px 28px 28px;color:#0F172A;font-size:15px;line-height:1.55;">
            ${body}
          </td></tr>
          <tr><td style="padding:16px 28px 28px 28px;color:#94A3B8;font-size:12px;">
            Orkora - events that run themselves.
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;

export function otpEmailTemplate(code: string) {
  const html = wrap(`
    <h1 style="margin:0 0 8px 0;font-size:22px;color:#0F172A;">Verify your email</h1>
    <p style="margin:0 0 24px 0;color:#64748B;">Use this code to finish signing in. It expires in 10 minutes.</p>
    <div style="background:#F5F3FF;border:1px solid #DDD6FE;border-radius:12px;padding:20px;text-align:center;">
      <div style="font-family:'SF Mono',Menlo,Consolas,monospace;font-size:36px;letter-spacing:8px;font-weight:700;color:#6D28D9;">
        ${code}
      </div>
    </div>
    <p style="margin:24px 0 0 0;color:#94A3B8;font-size:13px;">
      If you did not request this, you can ignore this email. Someone may have typed your address by mistake.
    </p>
  `);
  return {
    subject: `Your Orkora code: ${code}`,
    html,
    text: `Your Orkora verification code is ${code}. It expires in 10 minutes.`,
  };
}

export function inviteEmailTemplate(orgName: string, acceptUrl: string) {
  const html = wrap(`
    <h1 style="margin:0 0 8px 0;font-size:22px;color:#0F172A;">You have been invited</h1>
    <p style="margin:0 0 24px 0;color:#334155;">
      <strong>${escapeHtml(orgName)}</strong> has invited you to collaborate on Orkora.
    </p>
    <a href="${acceptUrl}" style="display:inline-block;background:#6D28D9;color:#ffffff;text-decoration:none;padding:14px 24px;border-radius:999px;font-weight:600;">
      Accept invitation
    </a>
    <p style="margin:24px 0 0 0;color:#94A3B8;font-size:13px;">
      Or paste this link into your browser:<br>
      <span style="color:#64748B;">${acceptUrl}</span>
    </p>
  `);
  return {
    subject: `Join ${orgName} on Orkora`,
    html,
    text: `${orgName} invited you to Orkora. Accept here: ${acceptUrl}`,
  };
}

export interface TicketEmailTicket {
  code: string;
  holderName: string;
  tierName: string;
  ticketUrl: string;
}

export function ticketConfirmationTemplate(input: {
  eventTitle: string;
  eventDateLine: string;
  tickets: TicketEmailTicket[];
}) {
  const { eventTitle, eventDateLine, tickets } = input;
  const ticketRows = tickets
    .map(
      (t) => `
    <tr><td style="padding:0 0 12px 0;">
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#F5F3FF;border:1px solid #DDD6FE;border-radius:12px;">
        <tr><td style="padding:16px 18px;">
          <div style="font-size:13px;color:#7C3AED;font-weight:700;letter-spacing:0.4px;text-transform:uppercase;">${escapeHtml(t.tierName)}</div>
          <div style="font-size:16px;color:#0F172A;font-weight:600;margin-top:4px;">${escapeHtml(t.holderName)}</div>
          <div style="font-family:'SF Mono',Menlo,Consolas,monospace;font-size:13px;color:#64748B;margin-top:6px;">${escapeHtml(t.code)}</div>
          <a href="${t.ticketUrl}" style="display:inline-block;margin-top:12px;background:#6D28D9;color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:999px;font-weight:600;font-size:13px;">View ticket</a>
        </td></tr>
      </table>
    </td></tr>`,
    )
    .join('');

  const html = wrap(`
    <h1 style="margin:0 0 8px 0;font-size:22px;color:#0F172A;">You are registered</h1>
    <p style="margin:0 0 6px 0;color:#0F172A;font-size:16px;font-weight:600;">${escapeHtml(eventTitle)}</p>
    <p style="margin:0 0 24px 0;color:#64748B;">${escapeHtml(eventDateLine)}</p>
    <table width="100%" cellpadding="0" cellspacing="0" border="0">
      ${ticketRows}
    </table>
    <p style="margin:24px 0 0 0;color:#94A3B8;font-size:13px;">
      Bring your ticket QR on the day. You can also access it any time from the Orkora app.
    </p>
  `);
  return {
    subject: `You are registered for ${eventTitle}`,
    html,
    text: `You are registered for ${eventTitle}. ${eventDateLine}. Tickets: ${tickets
      .map((t) => `${t.tierName} (${t.code}) - ${t.ticketUrl}`)
      .join(', ')}`,
  };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
