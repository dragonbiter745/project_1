import { HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { MAIL_FROM, RESEND_API_KEY, isEmulator } from '../config';
import { db } from '../db';

export interface Mail {
  to: string;
  subject: string;
  html: string;
  text: string;
}
export type MailSender = (mail: Mail) => Promise<void>;

/** Sends through Resend's HTTP API (no SDK, so nothing extra ships). Secrets must be listed on the function. */
const resend: MailSender = async (mail) => {
  const key = RESEND_API_KEY.value();
  if (!key) {
    if (isEmulator()) {
      // Local runs have no mail account: keep the message where a browser test can read it. Never reached when deployed.
      logger.info('Email kept in mailOutbox (no RESEND_API_KEY in the emulator)', { to: mail.to, subject: mail.subject });
      await db.collection('mailOutbox').add({ at: Date.now(), to: mail.to, subject: mail.subject, text: mail.text });
      return;
    }
    throw new HttpsError('failed-precondition', 'Email is not set up yet. Add the RESEND_API_KEY secret first.');
  }
  let res: Response;
  try {
    res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: MAIL_FROM.value(), to: [mail.to], subject: mail.subject, html: mail.html, text: mail.text }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch (err) {
    logger.error('Email send failed (network)', { err: String(err) });
    throw new HttpsError('unavailable', 'Could not reach the email service. Try again in a minute.');
  }
  if (!res.ok) {
    // The provider's reason (unverified domain, bad key) is for the logs, not for the screen.
    logger.error('Email send rejected', { status: res.status, body: (await res.text()).slice(0, 300) });
    throw new HttpsError('internal', 'The email could not be sent. Check the sender domain and API key.');
  }
};

let sender: MailSender = resend;
/** Test hook: capture mail instead of sending it. */
export const setMailSender = (fn: MailSender): void => {
  sender = fn;
};
export const sendMail = (mail: Mail): Promise<void> => sender(mail);
