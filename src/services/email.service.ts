import nodemailer, { type Transporter } from "nodemailer";

import { env } from "../config/env";

let transporter: Transporter | null = null;

const isConfigured = () => Boolean(env.SMTP_HOST && env.MAIL_FROM);

const getTransporter = () => {
  if (!isConfigured()) return null;

  transporter ??= nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    auth: env.SMTP_USER && env.SMTP_PASSWORD
      ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD }
      : undefined,
  });

  return transporter;
};

export const sendPasswordResetEmail = async (recipient: string, resetToken: string) => {
  const mailer = getTransporter();
  if (!mailer || !env.MAIL_FROM) return false;

  const resetUrl = new URL("/reset-password", env.FRONTEND_URL);
  resetUrl.searchParams.set("token", resetToken);

  await mailer.sendMail({
    from: env.MAIL_FROM,
    to: recipient,
    subject: "Reset your Workforce Management password",
    text: [
      "A password reset was requested for your Workforce Management account.",
      `Open this link to choose a new password: ${resetUrl.toString()}`,
      `The link expires in ${env.PASSWORD_RESET_TTL_MINUTES} minutes and can be used once.`,
      "If you did not request this reset, you can ignore this email.",
    ].join("\n\n"),
  });

  return true;
};
