import type { Role } from "@prisma/client";
import type { RequestHandler } from "express";

import { AppError } from "../utils/app-error";

export const requireRole = (...allowedRoles: Role[]): RequestHandler => {
  return (request, _response, next) => {
    if (!request.user) {
      next(new AppError(401, "Authentication required"));
      return;
    }

    if (!allowedRoles.includes(request.user.role)) {
      next(new AppError(403, "Insufficient permissions"));
      return;
    }

    next();
  };
};
