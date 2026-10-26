// Account emails (password resets), sent through Resend's HTTP API so it works on Workers.
// Without RESEND_API_KEY, development prints each email to the server console instead,
// and production says resets aren't available.

const devConsole = () => !process.env.RESEND_API_KEY && process.env.NODE_ENV !== "production";

export const emailConfigured = () => !!process.env.RESEND_API_KEY || devConsole();

export async function sendEmail(mail: { to: string; subject: string; text: string; html: string }) {
  if (devConsole()) {
    console.log(`[email] to ${mail.to}: ${mail.subject}\n${mail.text}`);
    return true;
  }
  if (!process.env.RESEND_API_KEY) return false;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: process.env.EMAIL_FROM || "Junia <no-reply@junipa.app>", to: [mail.to], subject: mail.subject, text: mail.text, html: mail.html }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) console.error("[email] send failed:", res.status, (await res.text()).slice(0, 300));
    return res.ok;
  } catch (e) {
    console.error("[email] send failed:", (e as Error).message);
    return false;
  }
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** A plain, single-button email in Junia's style. */
export function buttonEmail(o: { heading: string; intro: string; button: string; url: string; outro: string }) {
  const text = `${o.heading}\n\n${o.intro}\n\n${o.url}\n\n${o.outro}\n\nJunia`;
  const html = `<!doctype html><html><body style="margin:0;background:#f4f5f7;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#0b0d10">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:460px;background:#ffffff;border:1px solid #e4e6ea;border-radius:12px">
<tr><td style="padding:28px">
<p style="margin:0 0 20px;font-size:15px;font-weight:600">Junia</p>
<h1 style="margin:0 0 10px;font-size:20px;line-height:1.3">${esc(o.heading)}</h1>
<p style="margin:0 0 22px;font-size:14.5px;line-height:1.6;color:#444a55">${esc(o.intro)}</p>
<a href="${esc(o.url)}" style="display:inline-block;background:#0b0d10;color:#ffffff;text-decoration:none;font-size:14.5px;font-weight:600;padding:12px 20px;border-radius:8px">${esc(o.button)}</a>
<p style="margin:22px 0 0;font-size:13px;line-height:1.6;color:#6b7280">${esc(o.outro)}</p>
<p style="margin:14px 0 0;font-size:12px;line-height:1.5;color:#9ca3af;word-break:break-all">Button not working? Paste this into your browser:<br>${esc(o.url)}</p>
</td></tr></table></td></tr></table></body></html>`;
  return { text, html };
}
