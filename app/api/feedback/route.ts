import nodemailer from "nodemailer";
import { NextResponse } from "next/server";

type MailConfig = {
  host: string;
  port: number;
  secure: boolean;
  auth: { user: string; pass: string };
  to: string;
  /** SMTP-authorized address (Gmail only allows sending as this mailbox). */
  envelopeFrom: string;
};

/** Extract bare email from `addr` or `"Name" <addr>`. */
function bareEmail(s: string): string {
  const t = s.trim();
  const m = t.match(/<([^>]+)>/);
  return (m ? m[1] : t).trim();
}

function getMailConfig(): MailConfig | null {
  const host = process.env.FEEDBACK_SMTP_HOST;
  const portRaw = process.env.FEEDBACK_SMTP_PORT;
  const user = process.env.FEEDBACK_SMTP_USER;
  const pass = process.env.FEEDBACK_SMTP_PASS;
  const to = process.env.FEEDBACK_MAIL_TO;
  const fromEnv = process.env.FEEDBACK_MAIL_FROM?.trim();

  if (!host || !portRaw || !user || !pass || !to) return null;

  const port = Number.parseInt(portRaw, 10);
  if (!Number.isFinite(port) || port < 1) return null;

  const envelopeFrom = bareEmail(fromEnv || user);

  return {
    host,
    port,
    secure: process.env.FEEDBACK_SMTP_SECURE === "true",
    auth: { user, pass },
    to,
    envelopeFrom,
  };
}

const TITLE_MAX = 200;
const DESC_MAX = 10_000;
const EMAIL_MAX = 254;

function isValidEmail(s: string): boolean {
  if (s.length < 3 || s.length > EMAIL_MAX) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

export async function POST(req: Request) {
  const cfg = getMailConfig();
  if (!cfg) {
    return NextResponse.json(
      { error: "Email is not configured on the server." },
      { status: 503 }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid body." }, { status: 400 });
  }

  const emailRaw =
    typeof (body as { email?: unknown }).email === "string"
      ? (body as { email: string }).email.trim()
      : "";
  const title =
    typeof (body as { title?: unknown }).title === "string"
      ? (body as { title: string }).title.trim()
      : "";
  const description =
    typeof (body as { description?: unknown }).description === "string"
      ? (body as { description: string }).description.trim()
      : "";

  if (!emailRaw.length) {
    return NextResponse.json({ error: "Email is required." }, { status: 400 });
  }
  if (!isValidEmail(emailRaw)) {
    return NextResponse.json(
      { error: "Enter a valid email address." },
      { status: 400 }
    );
  }

  if (!title.length) {
    return NextResponse.json({ error: "Title is required." }, { status: 400 });
  }
  if (title.length > TITLE_MAX) {
    return NextResponse.json(
      { error: `Title must be at most ${TITLE_MAX} characters.` },
      { status: 400 }
    );
  }
  if (!description.length) {
    return NextResponse.json(
      { error: "Description is required." },
      { status: 400 }
    );
  }
  if (description.length > DESC_MAX) {
    return NextResponse.json(
      { error: `Description must be at most ${DESC_MAX} characters.` },
      { status: 400 }
    );
  }

  const rejectUnauthorized =
    process.env.FEEDBACK_SMTP_TLS_REJECT_UNAUTHORIZED !== "false";

  const transporter = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth: cfg.auth,
    tls: { rejectUnauthorized },
  });

  try {
    // Gmail (and most SMTP) only allows From = authenticated mailbox. We show the
    // submitter in the display name + Reply-To + body so it’s clearly “from them”.
    const fromHeader = `Feedback from ${emailRaw} <${cfg.envelopeFrom}>`;

    await transporter.sendMail({
      from: fromHeader,
      to: cfg.to,
      replyTo: emailRaw,
      subject: `[Feedback] ${title}`,
      text: `From: ${emailRaw}\n\n${description}`,
    });
  } catch (e) {
    console.error("[feedback] sendMail failed:", e);
    return NextResponse.json(
      { error: "Could not send feedback. Try again later." },
      { status: 502 }
    );
  }

  return NextResponse.json({ ok: true });
}
