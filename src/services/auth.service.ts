import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";

import { env } from "../config/env";
import { prisma } from "../lib/prisma";
import type { AuthUser } from "../types/auth";
import { AppError } from "../utils/app-error";

const JWT_ALGORITHM = "HS256" as const;

export const findUserById = async (id: string): Promise<AuthUser | null> => {
  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      email: true,
      role: true,
      employee: {
        select: { isActive: true },
      },
    },
  });

  if (!user || user.employee?.isActive === false) {
    return null;
  }

  return {
    id: user.id,
    email: user.email,
    role: user.role,
  };
};

export const login = async (email: string, password: string) => {
  const user = await prisma.user.findUnique({
    where: { email: email.trim().toLowerCase() },
    select: {
      id: true,
      email: true,
      passwordHash: true,
      role: true,
      employee: {
        select: { isActive: true },
      },
    },
  });

  if (
    !user
    || user.employee?.isActive === false
    || !(await bcrypt.compare(password, user.passwordHash))
  ) {
    throw new AppError(401, "Invalid email or password");
  }

  const token = jwt.sign(
    { role: user.role },
    env.JWT_SECRET,
    {
      algorithm: JWT_ALGORITHM,
      expiresIn: "1h",
      subject: user.id,
    },
  );

  return {
    token,
    user: {
      id: user.id,
      email: user.email,
      role: user.role,
    },
  };
};

export const verifyAccessToken = (token: string): string => {
  try {
    const payload = jwt.verify(token, env.JWT_SECRET, {
      algorithms: [JWT_ALGORITHM],
    });

    if (typeof payload === "string" || typeof payload.sub !== "string") {
      throw new Error("Token subject is missing");
    }

    return payload.sub;
  } catch {
    throw new AppError(401, "Invalid or expired authentication token");
  }
};
