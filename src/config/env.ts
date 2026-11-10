import { z } from "zod";

const optionalString = z.preprocess(
  (value) => typeof value === "string" && value.trim() === "" ? undefined : value,
  z.string().trim().min(1).optional(),
);

const optionalEmail = z.preprocess(
  (value) => typeof value === "string" && value.trim() === "" ? undefined : value,
  z.string().trim().email().optional(),
);

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().max(65_535).default(3000),
  CORS_ORIGIN: z
    .string()
    .url()
    .default("http://localhost:5173")
    .transform((value) => new URL(value).origin),
  DATABASE_URL: z.string().url(),
  JWT_SECRET: z.string().min(32, "JWT_SECRET must contain at least 32 characters"),
  ACCESS_TOKEN_TTL_MINUTES: z.coerce.number().int().min(5).max(60).default(15),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).max(30).default(7),
  PASSWORD_RESET_TTL_MINUTES: z.coerce.number().int().min(10).max(60).default(30),
  LOGIN_MAX_ATTEMPTS: z.coerce.number().int().min(3).max(20).default(5),
  LOGIN_LOCK_MINUTES: z.coerce.number().int().min(1).max(1440).default(15),
  ANNUAL_LEAVE_ALLOWANCE: z.coerce.number().int().min(0).max(365).default(20),
  SICK_LEAVE_ALLOWANCE: z.coerce.number().int().min(0).max(365).default(10),
  CASUAL_LEAVE_ALLOWANCE: z.coerce.number().int().min(0).max(365).default(5),
  DEMO_LOGIN_ENABLED: z.enum(["true", "false"]).default("false").transform((value) => value === "true"),
  DEMO_USER_EMAIL: optionalEmail,
  DEMO_USER_PASSWORD: optionalString,
  DEMO_ADMIN_EMAIL: optionalEmail,
  DEMO_ADMIN_PASSWORD: optionalString,
  FRONTEND_URL: z.preprocess(
    (value) => typeof value === "string" && value.trim() === "" ? undefined : value,
    z.string().url().optional(),
  ),
  SMTP_HOST: optionalString,
  SMTP_PORT: z.coerce.number().int().positive().max(65_535).default(587),
  SMTP_SECURE: z.enum(["true", "false"]).default("false").transform((value) => value === "true"),
  SMTP_USER: optionalString,
  SMTP_PASSWORD: optionalString,
  MAIL_FROM: optionalEmail,
});

const result = envSchema.safeParse(process.env);

if (!result.success) {
  console.error("Invalid environment configuration", result.error.flatten().fieldErrors);
  throw new Error("Invalid environment configuration");
}

export const env = {
  ...result.data,
  FRONTEND_URL: new URL(result.data.FRONTEND_URL ?? result.data.CORS_ORIGIN).origin,
};
