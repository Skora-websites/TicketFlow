import nodemailer from "nodemailer";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
const FROM = process.env.SMTP_FROM ?? "Helpdesk <no-reply@localhost>";

function getTransport() {
  const host = process.env.SMTP_HOST;
  if (!host) return null;
  return nodemailer.createTransport({
    host,
    port: Number(process.env.SMTP_PORT ?? 465),
    secure: (process.env.SMTP_SECURE ?? "true") === "true",
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
      : undefined,
  });
}

export function isSmtpConfigured(): boolean {
  return Boolean(process.env.SMTP_HOST);
}

/**
 * Client self-registration verification email. Mirrors the reset flow: token
 * is single-use, 30-minute expiry enforced by the caller; without SMTP the
 * register route surfaces the link via its dev-only fallback.
 */
export async function sendVerificationEmail(email: string, token: string): Promise<void> {
  const url = `${APP_URL}/api/auth/verify/${token}`;

  const transport = getTransport();
  if (!transport) {
    console.warn(
      `[email-verify] SMTP not configured; verification email for ${email} was NOT delivered.`
    );
    return;
  }

  await transport.sendMail({
    from: FROM,
    to: email,
    subject: "Verify your email address",
    text: `Confirm your email address by visiting: ${url}\nThis link expires in 30 minutes.`,
    html: `<p>Confirm your email address by visiting:</p><p><a href="${url}">${url}</a></p><p>This link expires in 30 minutes.</p>`,
  });
}

/**
 * New staff account: the username + password are delivered by email, per the
 * account-creation flow. Password is NEVER logged; without SMTP the caller
 * surfaces credentials via its dev-only fallback instead.
 */
export async function sendCredentialEmail(
  email: string,
  password: string,
  name: string,
  role: string
): Promise<void> {
  const transport = getTransport();
  if (!transport) {
    console.warn(
      `[credentials] SMTP not configured; account email for ${email} was NOT delivered.`
    );
    return;
  }

  const roleLabel = role === "team" ? "Agent" : role === "manager" ? "Manager" : role;
  await transport.sendMail({
    from: FROM,
    to: email,
    subject: `Your helpdesk account is ready`,
    text: `Hi ${name},\n\nAn account has been created for you on the helpdesk (${roleLabel}).\n\nUsername: ${email}\nPassword: ${password}\n\nPlease sign in and change your password from Settings after your first login.`,
    html: `<p>Hi ${name},</p><p>An account has been created for you on the helpdesk (${roleLabel}).</p><p><strong>Username:</strong> ${email}<br/><strong>Password:</strong> ${password}</p><p>Please sign in and change your password from Settings after your first login.</p>`,
  });
}

export async function sendPasswordResetEmail(email: string, token: string): Promise<void> {
  const url = `${APP_URL}/reset-password/${token}`;

  const transport = getTransport();
  if (!transport) {
    // No SMTP configured — never log the reset URL itself: server logs are a
    // common leak channel and would let anyone with log access reset the
    // account. Set SMTP_HOST/PORT/USER/PASS to deliver real mail.
    console.warn(
      `[password-reset] SMTP not configured; reset email for ${email} was NOT delivered.`
    );
    return;
  }

  await transport.sendMail({
    from: FROM,
    to: email,
    subject: "Reset your password",
    text: `Reset your password by visiting: ${url}\nThis link expires in 30 minutes.`,
    html: `<p>Reset your password by visiting:</p><p><a href="${url}">${url}</a></p><p>This link expires in 30 minutes.</p>`,
  });
}

/**
 * Best-effort email for in-app notification events (assignment, status change,
 * new comment). Silently skipped when SMTP is not configured; failures are
 * logged but never thrown so they can't break ticket operations.
 */
export async function sendTicketNotificationEmail(
  to: string,
  payload: { ticketNumber: string; title: string; body: string; type: string }
): Promise<void> {
  const transport = getTransport();
  if (!transport) return;

  const url = `${APP_URL}/dashboard/tickets`;
  try {
    await transport.sendMail({
      from: FROM,
      to,
      subject: `[${payload.ticketNumber}] ${payload.title}`,
      text: `${payload.body}\n\nView the ticket at: ${url}`,
      html: `<p>${payload.body}</p><p><a href="${url}">View ticket ${payload.ticketNumber}</a></p>`,
    });
  } catch (err) {
    console.error(`[notify] failed to send email to ${to}:`, err);
  }
}
