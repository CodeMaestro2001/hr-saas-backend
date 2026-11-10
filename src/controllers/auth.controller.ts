import type { CookieOptions, Request, RequestHandler, Response } from "express";
import { Role } from "@prisma/client";

import { env } from "../config/env";
import * as authService from "../services/auth.service";
import { AppError } from "../utils/app-error";
import {
  changePasswordSchema,
  forgotPasswordSchema,
  loginSchema,
  resetPasswordSchema,
} from "../validation/auth.validation";

const REFRESH_COOKIE_NAME = "workforce_refresh";
const refreshCookieBaseOptions: CookieOptions = {
  httpOnly: true,
  secure: env.NODE_ENV === "production",
  sameSite: "strict",
  path: "/api/auth",
};

const getMetadata = (request: Request): authService.SessionMetadata => ({
  ipAddress: request.ip,
  userAgent: request.get("user-agent"),
});

const getRefreshCookie = (request: Request) => {
  const value = request.cookies?.[REFRESH_COOKIE_NAME];
  return typeof value === "string" ? value : undefined;
};

const setRefreshCookie = (response: Response, token: string) => {
  response.cookie(REFRESH_COOKIE_NAME, token, {
    ...refreshCookieBaseOptions,
    maxAge: env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1_000,
  });
};

const clearRefreshCookie = (response: Response) => {
  response.clearCookie(REFRESH_COOKIE_NAME, refreshCookieBaseOptions);
};

export const login: RequestHandler = async (request, response) => {
  const result = loginSchema.safeParse(request.body);
  if (!result.success) {
    response.status(400).json({
      error: { message: "Invalid request body", fields: result.error.flatten().fieldErrors },
    });
    return;
  }

  const session = await authService.login(
    result.data.email,
    result.data.password,
    getMetadata(request),
  );
  setRefreshCookie(response, session.refreshToken);
  response.status(200).json({ token: session.token, user: session.user });
};

export const demoLogin: RequestHandler = async (request, response) => {
  if (!env.DEMO_LOGIN_ENABLED || !env.DEMO_USER_EMAIL || !env.DEMO_USER_PASSWORD) {
    throw new AppError(404, "Demo access is not available");
  }

  const session = await authService.login(
    env.DEMO_USER_EMAIL,
    env.DEMO_USER_PASSWORD,
    getMetadata(request),
  );
  if (session.user.role !== Role.EMPLOYEE) {
    await authService.revokeRefreshToken(session.refreshToken);
    throw new AppError(503, "Demo access is not configured safely");
  }

  setRefreshCookie(response, session.refreshToken);
  response.status(200).json({ token: session.token, user: session.user });
};

export const demoAdminLogin: RequestHandler = async (request, response) => {
  if (!env.DEMO_LOGIN_ENABLED || !env.DEMO_ADMIN_EMAIL || !env.DEMO_ADMIN_PASSWORD) {
    throw new AppError(404, "Demo access is not available");
  }

  const session = await authService.login(
    env.DEMO_ADMIN_EMAIL,
    env.DEMO_ADMIN_PASSWORD,
    getMetadata(request),
  );
  if (session.user.role !== Role.ADMIN) {
    await authService.revokeRefreshToken(session.refreshToken);
    throw new AppError(503, "Demo access is not configured safely");
  }

  setRefreshCookie(response, session.refreshToken);
  response.status(200).json({ token: session.token, user: session.user });
};

export const refresh: RequestHandler = async (request, response) => {
  const refreshToken = getRefreshCookie(request);
  if (!refreshToken) throw new AppError(401, "Session refresh is required");

  const session = await authService.refreshSession(refreshToken, getMetadata(request));
  setRefreshCookie(response, session.refreshToken);
  response.status(200).json({ token: session.token, user: session.user });
};

export const logout: RequestHandler = async (request, response) => {
  await authService.revokeRefreshToken(getRefreshCookie(request));
  clearRefreshCookie(response);
  response.status(204).send();
};

export const forgotPassword: RequestHandler = async (request, response) => {
  const result = forgotPasswordSchema.safeParse(request.body);
  if (!result.success) {
    response.status(400).json({
      error: { message: "Invalid request body", fields: result.error.flatten().fieldErrors },
    });
    return;
  }

  const body = await authService.requestPasswordReset(result.data.email);
  response.status(202).json(body);
};

export const resetPassword: RequestHandler = async (request, response) => {
  const result = resetPasswordSchema.safeParse(request.body);
  if (!result.success) {
    response.status(400).json({
      error: { message: "Invalid request body", fields: result.error.flatten().fieldErrors },
    });
    return;
  }

  await authService.resetPassword(result.data.token, result.data.newPassword);
  clearRefreshCookie(response);
  response.status(204).send();
};

export const changePassword: RequestHandler = async (request, response) => {
  const result = changePasswordSchema.safeParse(request.body);
  if (!result.success) {
    response.status(400).json({
      error: { message: "Invalid request body", fields: result.error.flatten().fieldErrors },
    });
    return;
  }

  await authService.changePassword(
    request.user!.id,
    result.data.currentPassword,
    result.data.newPassword,
  );
  clearRefreshCookie(response);
  response.status(204).send();
};

export const getCurrentUser: RequestHandler = (request, response) => {
  response.status(200).json({ user: request.user });
};
