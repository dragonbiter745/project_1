import { INVITE_TTL_HOURS, VENDOR_LOGIN_LABEL, type VendorLoginRole } from '@foodcourt/shared';
import type { Mail } from './mailer';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export interface InviteEmailInput {
  to: string;
  shopName: string;
  role: VendorLoginRole;
  link: string;
  /** invite: first-time setup. reset: a new password for an existing login. */
  kind: 'invite' | 'reset';
  logoUrl: string;
}

/**
 * One short, single-purpose email: who you are on which shop, and one button. Table layout and inline styles
 * because mail clients ignore most CSS; light colours are set explicitly so dark-mode clients do not wash them out.
 */
export function inviteEmail(i: InviteEmailInput): Mail {
  const role = VENDOR_LOGIN_LABEL[i.role];
  const reset = i.kind === 'reset';
  const subject = reset ? `Reset your Qrave password for ${i.shopName}` : `Set up your Qrave login for ${i.shopName}`;
  const heading = reset ? 'Choose a new password' : 'Your login is ready';
  const lead = reset
    ? `Use the button below to choose a new password for <strong>${esc(i.shopName)}</strong> on Qrave.`
    : `You have been added to <strong>${esc(i.shopName)}</strong> on Qrave as <strong>${esc(role)}</strong>. Choose a password to finish.`;
  const cta = reset ? 'Choose new password' : 'Set my password';

  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light only"><meta name="supported-color-schemes" content="light only"><title>${esc(subject)}</title></head>
<body style="margin:0;padding:0;background:#FAF9F6;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(reset ? 'Choose a new password.' : `Set your password to start using Qrave for ${i.shopName}.`)}</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#FAF9F6;"><tr><td align="center" style="padding:32px 16px;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:480px;">
    <tr><td style="padding:0 4px 20px;"><img src="${esc(i.logoUrl)}" width="112" alt="Qrave" style="display:block;border:0;height:auto;width:112px;"></td></tr>
    <tr><td style="background:#FFFFFF;border:1px solid #E5E0D7;border-radius:20px;padding:32px 28px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#343A36;">
      <h1 style="margin:0 0 12px;font-size:24px;line-height:30px;font-weight:700;color:#343A36;">${heading}</h1>
      <p style="margin:0 0 24px;font-size:16px;line-height:24px;color:#545955;">${lead}</p>
      <table role="presentation" cellspacing="0" cellpadding="0"><tr><td style="background:#B95C3C;border-radius:12px;">
        <a href="${esc(i.link)}" style="display:inline-block;padding:14px 26px;font-size:16px;font-weight:600;line-height:20px;color:#FFFFFF;text-decoration:none;">${cta}</a>
      </td></tr></table>
      <p style="margin:24px 0 0;font-size:14px;line-height:21px;color:#6C6860;">Sign in with <strong style="color:#343A36;">${esc(i.to)}</strong>. This link works once and expires in ${INVITE_TTL_HOURS} hours.</p>
    </td></tr>
    <tr><td style="padding:20px 8px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:12px;line-height:18px;color:#817D75;">
      Button not working? Paste this into your browser:<br><a href="${esc(i.link)}" style="color:#9E4B2F;word-break:break-all;">${esc(i.link)}</a><br><br>
      Not expecting this email? Ignore it. Nothing changes unless you use the link.
    </td></tr>
  </table>
</td></tr></table>
</body></html>`;

  const text = [
    heading,
    '',
    reset ? `Choose a new password for ${i.shopName} on Qrave.` : `You have been added to ${i.shopName} on Qrave as ${role}. Choose a password to finish.`,
    '',
    `${cta}: ${i.link}`,
    '',
    `Sign in with ${i.to}. This link works once and expires in ${INVITE_TTL_HOURS} hours.`,
    'Not expecting this email? Ignore it. Nothing changes unless you use the link.',
  ].join('\n');

  return { to: i.to, subject, html, text };
}
