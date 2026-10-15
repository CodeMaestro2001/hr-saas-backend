import type { RequestHandler } from "express";

import * as authService from "../services/auth.service";
import { AppError } from "../utils/app-error";

export const authenticate: RequestHandler = async (request, _response, next) => {
  const authorization = request.header("authorization");
  const match = authorization?.match(/^Bearer\s+(.+)$/i);

  if (!match) {
    next(new AppError(401, "Authentication required"));
    return;
  }

  try {
    const userId = authService.verifyAccessToken(match[1]);
    const user = await authService.findUserById(userId);

    if (!user) {
      next(new AppError(401, "Invalid authentication"));
      return;
    }

    request.user = user;
    next();
  } catch (error) {
    next(error);
  }
};
