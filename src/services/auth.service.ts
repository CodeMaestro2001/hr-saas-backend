import { type Prisma, type Role } from "@prisma/client";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";

import { env } from "../config/env";
import { prisma } from "../lib/prisma";
import type { AuthUser } from "../types/auth";
import { AppError } from "../utils/app-error";
import { createSecureToken, hashSecureToken } from "../utils/secure-token";
import { sendPasswordResetEmail } from "./email.service";

const JWT_ALGORITHM = "HS256" as const;
const HASH_ROUNDS = 12;
const GENERIC_LOGIN_ERROR = "Invalid email or password";
const GENERIC_RESET_RESPONSE = "If an active account matches that email, a reset link will be sent.";
const ROTATION_RACE_GRACE_MS = 5_000;
const dummyHashPromise = bcrypt.hash("not-a-real-workforce-password", HASH_ROUNDS);

const authUserSelect = {
  id: true,
  email: true,
  role: true,
  tokenVersion: true,
  employee: {
    select: { isActive: true },
  },
} satisfies Prisma.UserSelect;

const loginUserSelect = {
  ...authUserSelect,
  passwordHash: true,
  failedLoginAttempts: true,
  lockedUntil: true,
} satisfies Prisma.UserSelect;

export interface SessionMetadata {
  ipAddress?: string;
  userAgent?: string;
}

const normalizeMetadata = ({ ipAddress, userAgent }: SessionMetadata) => ({
  ipAddress: ipAddress?.slice(0, 64),
  userAgent: userAgent?.slice(0, 500),
});

const toAuthUser = (user: { id: string; email: string; role: Role }): AuthUser => ({
  id: user.id,
  email: user.email,
  role: user.role,
});

const signAccessToken = (user: { id: string; role: Role; tokenVersion: number }) => {
  return jwt.sign(
    { role: user.role, tokenVersion: user.tokenVersion },
    env.JWT_SECRET,
    {
      algorithm: JWT_ALGORITHM,
      expiresIn: env.ACCESS_TOKEN_TTL_MINUTES * 60,
      subject: user.id,
    },
  );
};

const createRefreshTokenData = (userId: string, rawToken: string, metadata: SessionMetadata) => ({
  userId,
  tokenHash: hashSecureToken(rawToken),
  expiresAt: new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1_000),
  ...normalizeMetadata(metadata),
});

const recordLoginAttempt = async (
  attemptedEmail: string,
  success: boolean,
  metadata: SessionMetadata,
  userId?: string,
) => {
  await prisma.loginAttempt.create({
    data: {
      attemptedEmail,
      success,
      userId,
      ...normalizeMetadata(metadata),
    },
  });
};

export const findUserById = async (
  id: string,
  expectedTokenVersion?: number,
): Promise<AuthUser | null> => {
  const user = await prisma.user.findUnique({
    where: { id },
    select: authUserSelect,
  });

  if (
    !user
    || user.employee?.isActive === false
    || (expectedTokenVersion !== undefined && user.tokenVersion !== expectedTokenVersion)
  ) {
    return null;
  }

  return toAuthUser(user);
};

export const login = async (
  email: string,
  password: string,
  metadata: SessionMetadata = {},
) => {
  const normalizedEmail = email.trim().toLowerCase();
  const now = new Date();
  const user = await prisma.user.findUnique({
    where: { email: normalizedEmail },
    select: loginUserSelect,
  });

  const passwordMatches = user
    ? await bcrypt.compare(password, user.passwordHash)
    : await bcrypt.compare(password, await dummyHashPromise);
  const isLocked = Boolean(user?.lockedUntil && user.lockedUntil > now);
  const isInactive = user?.employee?.isActive === false;

  if (!user || !passwordMatches || isLocked || isInactive) {
    if (user && !passwordMatches && !isLocked && !isInactive) {
      const attemptsBeforeFailure = user.lockedUntil && user.lockedUntil <= now
        ? 0
        : user.failedLoginAttempts;
      const nextAttempts = attemptsBeforeFailure + 1;
      const shouldLock = nextAttempts >= env.LOGIN_MAX_ATTEMPTS;

      await prisma.user.update({
        where: { id: user.id },
        data: {
          failedLoginAttempts: nextAttempts,
          lockedUntil: shouldLock
            ? new Date(now.getTime() + env.LOGIN_LOCK_MINUTES * 60 * 1_000)
            : null,
        },
      });
    }

    await recordLoginAttempt(normalizedEmail, false, metadata, user?.id);
    throw new AppError(401, GENERIC_LOGIN_ERROR);
  }

  const rawRefreshToken = createSecureToken(64);
  await prisma.$transaction([
    prisma.user.update({
      where: { id: user.id },
      data: { failedLoginAttempts: 0, lockedUntil: null },
    }),
    prisma.loginAttempt.create({
      data: {
        attemptedEmail: normalizedEmail,
        success: true,
        userId: user.id,
        ...normalizeMetadata(metadata),
      },
    }),
    prisma.refreshToken.create({
      data: createRefreshTokenData(user.id, rawRefreshToken, metadata),
    }),
  ]);

  return {
    token: signAccessToken(user),
    refreshToken: rawRefreshToken,
    user: toAuthUser(user),
  };
};

type RefreshResult =
  | { status: "ok"; user: { id: string; email: string; role: Role; tokenVersion: number }; refreshToken: string }
  | { status: "invalid" };

export const refreshSession = async (rawRefreshToken: string, metadata: SessionMetadata = {}) => {
  const currentHash = hashSecureToken(rawRefreshToken);
  const nextRawToken = createSecureToken(64);
  const now = new Date();

  const result = await prisma.$transaction<RefreshResult>(async (transaction) => {
    const storedToken = await transaction.refreshToken.findUnique({
      where: { tokenHash: currentHash },
      include: {
        user: {
          select: authUserSelect,
        },
      },
    });

    if (!storedToken) return { status: "invalid" };

    if (storedToken.revokedAt) {
      // A second tab can submit the prior cookie while the first rotation response is in flight.
      // Reject that request, but only treat older reuse as evidence that the token was stolen.
      if (now.getTime() - storedToken.revokedAt.getTime() <= ROTATION_RACE_GRACE_MS) {
        return { status: "invalid" };
      }
      await transaction.refreshToken.updateMany({
        where: { userId: storedToken.userId, revokedAt: null },
        data: { revokedAt: now },
      });
      return { status: "invalid" };
    }

    if (storedToken.expiresAt <= now || storedToken.user.employee?.isActive === false) {
      await transaction.refreshToken.updateMany({
        where: { id: storedToken.id, revokedAt: null },
        data: { revokedAt: now },
      });
      return { status: "invalid" };
    }

    const revoked = await transaction.refreshToken.updateMany({
      where: { id: storedToken.id, revokedAt: null },
      data: { revokedAt: now },
    });

    if (revoked.count !== 1) {
      // Another concurrent request won the atomic rotation. Do not revoke its new token.
      return { status: "invalid" };
    }

    await transaction.refreshToken.create({
      data: createRefreshTokenData(storedToken.userId, nextRawToken, metadata),
    });

    return {
      status: "ok",
      user: storedToken.user,
      refreshToken: nextRawToken,
    };
  });

  if (result.status !== "ok") {
    throw new AppError(401, "Invalid or expired session");
  }

  return {
    token: signAccessToken(result.user),
    refreshToken: result.refreshToken,
    user: toAuthUser(result.user),
  };
};

export const revokeRefreshToken = async (rawRefreshToken?: string) => {
  if (!rawRefreshToken) return;

  await prisma.refreshToken.updateMany({
    where: { tokenHash: hashSecureToken(rawRefreshToken), revokedAt: null },
    data: { revokedAt: new Date() },
  });
};

export const changePassword = async (
  userId: string,
  currentPassword: string,
  newPassword: string,
) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, passwordHash: true },
  });

  if (!user || !(await bcrypt.compare(currentPassword, user.passwordHash))) {
    throw new AppError(400, "Current password is incorrect");
  }

  const passwordHash = await bcrypt.hash(newPassword, HASH_ROUNDS);
  const now = new Date();
  await prisma.$transaction([
    prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        passwordChangedAt: now,
        tokenVersion: { increment: 1 },
        failedLoginAttempts: 0,
        lockedUntil: null,
      },
    }),
    prisma.refreshToken.updateMany({
      where: { userId: user.id, revokedAt: null },
      data: { revokedAt: now },
    }),
    prisma.passwordResetToken.updateMany({
      where: { userId: user.id, usedAt: null },
      data: { usedAt: now },
    }),
  ]);
};

export const requestPasswordReset = async (email: string) => {
  const startedAt = Date.now();
  const normalizedEmail = email.trim().toLowerCase();
  const user = await prisma.user.findUnique({
    where: { email: normalizedEmail },
    select: {
      id: true,
      email: true,
      employee: { select: { isActive: true } },
    },
  });

  if (user && user.employee?.isActive !== false) {
    const rawToken = createSecureToken(48);
    const tokenHash = hashSecureToken(rawToken);
    const now = new Date();
    await prisma.$transaction([
      prisma.passwordResetToken.updateMany({
        where: { userId: user.id, usedAt: null },
        data: { usedAt: now },
      }),
      prisma.passwordResetToken.create({
        data: {
          userId: user.id,
          tokenHash,
          expiresAt: new Date(now.getTime() + env.PASSWORD_RESET_TTL_MINUTES * 60 * 1_000),
        },
      }),
    ]);

    try {
      const delivered = await sendPasswordResetEmail(user.email, rawToken);
      if (!delivered) {
        await prisma.passwordResetToken.updateMany({
          where: { tokenHash, usedAt: null },
          data: { usedAt: new Date() },
        });
        console.warn("Password reset email delivery is not configured");
      }
    } catch {
      await prisma.passwordResetToken.updateMany({
        where: { tokenHash, usedAt: null },
        data: { usedAt: new Date() },
      });
      console.error("Password reset email delivery failed");
    }
  }

  if (env.NODE_ENV !== "test") {
    const remainingDelay = 500 - (Date.now() - startedAt);
    if (remainingDelay > 0) {
      await new Promise((resolve) => setTimeout(resolve, remainingDelay));
    }
  }

  return { message: GENERIC_RESET_RESPONSE };
};

export const resetPassword = async (rawToken: string, newPassword: string) => {
  const now = new Date();
  const passwordHash = await bcrypt.hash(newPassword, HASH_ROUNDS);
  const tokenHash = hashSecureToken(rawToken);

  const changed = await prisma.$transaction(async (transaction) => {
    const resetToken = await transaction.passwordResetToken.findUnique({
      where: { tokenHash },
      include: {
        user: {
          select: {
            id: true,
            employee: { select: { isActive: true } },
          },
        },
      },
    });

    if (
      !resetToken
      || resetToken.usedAt
      || resetToken.expiresAt <= now
      || resetToken.user.employee?.isActive === false
    ) {
      return false;
    }

    const consumed = await transaction.passwordResetToken.updateMany({
      where: { id: resetToken.id, usedAt: null, expiresAt: { gt: now } },
      data: { usedAt: now },
    });
    if (consumed.count !== 1) return false;

    await transaction.user.update({
      where: { id: resetToken.userId },
      data: {
        passwordHash,
        passwordChangedAt: now,
        tokenVersion: { increment: 1 },
        failedLoginAttempts: 0,
        lockedUntil: null,
      },
    });
    await transaction.refreshToken.updateMany({
      where: { userId: resetToken.userId, revokedAt: null },
      data: { revokedAt: now },
    });
    await transaction.passwordResetToken.updateMany({
      where: { userId: resetToken.userId, usedAt: null },
      data: { usedAt: now },
    });
    return true;
  });

  if (!changed) {
    throw new AppError(400, "Invalid or expired password reset link");
  }
};

export const verifyAccessToken = (token: string) => {
  try {
    const payload = jwt.verify(token, env.JWT_SECRET, {
      algorithms: [JWT_ALGORITHM],
    });

    if (
      typeof payload === "string"
      || typeof payload.sub !== "string"
      || typeof payload.tokenVersion !== "number"
    ) {
      throw new Error("Token payload is invalid");
    }

    return { userId: payload.sub, tokenVersion: payload.tokenVersion };
  } catch {
    throw new AppError(401, "Invalid or expired authentication token");
  }
};
