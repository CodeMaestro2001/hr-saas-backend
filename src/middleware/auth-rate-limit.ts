import { rateLimit } from "express-rate-limit";

import { env } from "../config/env";

const commonOptions = {
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => env.NODE_ENV === "test",
};

export const loginRateLimit = rateLimit({
  ...commonOptions,
  windowMs: 15 * 60 * 1_000,
  limit: 10,
  message: { error: { message: "Too many login attempts. Please try again later." } },
});

export const passwordResetRateLimit = rateLimit({
  ...commonOptions,
  windowMs: 60 * 60 * 1_000,
  limit: 5,
  message: { error: { message: "Too many password reset requests. Please try again later." } },
});
