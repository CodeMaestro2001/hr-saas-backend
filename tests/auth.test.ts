import { Role } from "@prisma/client";
import bcrypt from "bcrypt";
import express from "express";
import jwt from "jsonwebtoken";
import request from "supertest";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  userFindUnique: vi.fn(),
  userUpdate: vi.fn(),
  loginAttemptCreate: vi.fn(),
  refreshTokenFindUnique: vi.fn(),
  refreshTokenCreate: vi.fn(),
  refreshTokenUpdateMany: vi.fn(),
  resetTokenFindUnique: vi.fn(),
  resetTokenCreate: vi.fn(),
  resetTokenUpdateMany: vi.fn(),
  transaction: vi.fn(),
  sendPasswordResetEmail: vi.fn(),
}));

vi.mock("../src/lib/prisma", () => {
  const prisma = {
    user: {
      findUnique: mocks.userFindUnique,
      update: mocks.userUpdate,
    },
    loginAttempt: { create: mocks.loginAttemptCreate },
    refreshToken: {
      findUnique: mocks.refreshTokenFindUnique,
      create: mocks.refreshTokenCreate,
      updateMany: mocks.refreshTokenUpdateMany,
    },
    passwordResetToken: {
      findUnique: mocks.resetTokenFindUnique,
      create: mocks.resetTokenCreate,
      updateMany: mocks.resetTokenUpdateMany,
    },
    $transaction: mocks.transaction,
  };

  mocks.transaction.mockImplementation(async (input: unknown) => {
    if (typeof input === "function") {
      return input(prisma);
    }
    return Promise.all(input as Array<Promise<unknown>>);
  });

  return { prisma };
});

vi.mock("../src/services/email.service", () => ({
  sendPasswordResetEmail: mocks.sendPasswordResetEmail,
}));

import { createApp } from "../src/app";
import { env } from "../src/config/env";
import { authenticate } from "../src/middleware/auth";
import { requireRole } from "../src/middleware/authorize";
import { errorHandler } from "../src/middleware/error-handler";
import { hashSecureToken } from "../src/utils/secure-token";

const user = {
  id: "155f95aa-5f32-4bc6-902b-3d4062100572",
  email: "employee@example.com",
  role: Role.EMPLOYEE,
  tokenVersion: 0,
  employee: { isActive: true },
};

let passwordHash: string;

const createToken = (options?: jwt.SignOptions & { tokenVersion?: number }) => {
  const { tokenVersion = 0, ...signOptions } = options ?? {};
  return jwt.sign({ role: user.role, tokenVersion }, env.JWT_SECRET, {
    algorithm: "HS256",
    subject: user.id,
    expiresIn: "15m",
    ...signOptions,
  });
};

beforeAll(async () => {
  passwordHash = await bcrypt.hash("correct-password", 4);
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.userUpdate.mockResolvedValue(user);
  mocks.loginAttemptCreate.mockResolvedValue({});
  mocks.refreshTokenCreate.mockResolvedValue({});
  mocks.refreshTokenUpdateMany.mockResolvedValue({ count: 1 });
  mocks.resetTokenCreate.mockResolvedValue({});
  mocks.resetTokenUpdateMany.mockResolvedValue({ count: 1 });
  mocks.sendPasswordResetEmail.mockResolvedValue(true);
});

describe("POST /api/auth/login", () => {
  it("returns a short-lived access token and sets a protected refresh cookie", async () => {
    mocks.userFindUnique.mockResolvedValue({
      ...user,
      passwordHash,
      failedLoginAttempts: 0,
      lockedUntil: null,
    });

    const response = await request(createApp()).post("/api/auth/login").send({
      email: "EMPLOYEE@example.com",
      password: "correct-password",
    });

    expect(response.status).toBe(200);
    expect(response.body.user).toEqual({ id: user.id, email: user.email, role: user.role });
    expect(response.body).not.toHaveProperty("refreshToken");
    expect(response.headers["set-cookie"][0]).toContain("workforce_refresh=");
    expect(response.headers["set-cookie"][0]).toContain("HttpOnly");
    expect(response.headers["set-cookie"][0]).toContain("SameSite=Strict");

    const payload = jwt.verify(response.body.token, env.JWT_SECRET, { algorithms: ["HS256"] });
    expect(payload).toMatchObject({ sub: user.id, role: Role.EMPLOYEE, tokenVersion: 0 });
    if (typeof payload !== "string") {
      expect(payload.exp! - payload.iat!).toBe(env.ACCESS_TOKEN_TTL_MINUTES * 60);
    }
    expect(mocks.refreshTokenCreate).toHaveBeenCalledOnce();
    expect(mocks.loginAttemptCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ success: true, attemptedEmail: user.email }),
    }));
  });

  it.each([
    ["unknown user", false, "correct-password"],
    ["wrong password", true, "wrong-password"],
  ])("returns the same generic error for %s and records the failure", async (_case, userExists, password) => {
    mocks.userFindUnique.mockResolvedValue(userExists ? {
      ...user,
      passwordHash,
      failedLoginAttempts: 0,
      lockedUntil: null,
    } : null);

    const response = await request(createApp()).post("/api/auth/login").send({
      email: user.email,
      password,
    });

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: { message: "Invalid email or password" } });
    expect(mocks.loginAttemptCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ success: false }),
    }));
  });

  it("locks the account after the configured number of failed attempts", async () => {
    mocks.userFindUnique.mockResolvedValue({
      ...user,
      passwordHash,
      failedLoginAttempts: env.LOGIN_MAX_ATTEMPTS - 1,
      lockedUntil: null,
    });

    const response = await request(createApp()).post("/api/auth/login").send({
      email: user.email,
      password: "wrong-password",
    });

    expect(response.status).toBe(401);
    expect(mocks.userUpdate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        failedLoginAttempts: env.LOGIN_MAX_ATTEMPTS,
        lockedUntil: expect.any(Date),
      }),
    }));
  });
});

describe("refresh-token lifecycle", () => {
  it("rotates a valid refresh token and issues a new access token", async () => {
    mocks.refreshTokenFindUnique.mockResolvedValue({
      id: "refresh-id",
      userId: user.id,
      tokenHash: hashSecureToken("current-refresh-token"),
      expiresAt: new Date(Date.now() + 60_000),
      revokedAt: null,
      user,
    });

    const response = await request(createApp())
      .post("/api/auth/refresh")
      .set("Cookie", "workforce_refresh=current-refresh-token");

    expect(response.status).toBe(200);
    expect(response.body.user).toEqual({ id: user.id, email: user.email, role: user.role });
    expect(response.headers["set-cookie"][0]).toContain("workforce_refresh=");
    expect(mocks.refreshTokenUpdateMany).toHaveBeenCalledWith({
      where: { id: "refresh-id", revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
    expect(mocks.refreshTokenCreate).toHaveBeenCalledOnce();
  });

  it("rejects a reused revoked token and revokes the remaining session family", async () => {
    mocks.refreshTokenFindUnique.mockResolvedValue({
      id: "refresh-id",
      userId: user.id,
      expiresAt: new Date(Date.now() + 60_000),
      revokedAt: new Date(Date.now() - 10_000),
      user,
    });

    const response = await request(createApp())
      .post("/api/auth/refresh")
      .set("Cookie", "workforce_refresh=reused-token");

    expect(response.status).toBe(401);
    expect(mocks.refreshTokenUpdateMany).toHaveBeenCalledWith({
      where: { userId: user.id, revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
  });

  it("does not revoke the winning session during an immediate multi-tab rotation race", async () => {
    mocks.refreshTokenFindUnique.mockResolvedValue({
      id: "refresh-id",
      userId: user.id,
      expiresAt: new Date(Date.now() + 60_000),
      revokedAt: new Date(),
      user,
    });

    const response = await request(createApp())
      .post("/api/auth/refresh")
      .set("Cookie", "workforce_refresh=just-rotated-token");

    expect(response.status).toBe(401);
    expect(mocks.refreshTokenUpdateMany).not.toHaveBeenCalled();
  });

  it("revokes the current refresh token and clears the cookie on logout", async () => {
    const response = await request(createApp())
      .post("/api/auth/logout")
      .set("Cookie", "workforce_refresh=current-refresh-token");

    expect(response.status).toBe(204);
    expect(mocks.refreshTokenUpdateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { tokenHash: hashSecureToken("current-refresh-token"), revokedAt: null },
    }));
    expect(response.headers["set-cookie"][0]).toContain("workforce_refresh=;");
  });
});

describe("password recovery", () => {
  it("returns the same accepted response when an account does not exist", async () => {
    mocks.userFindUnique.mockResolvedValue(null);

    const response = await request(createApp()).post("/api/auth/forgot-password").send({
      email: "unknown@example.com",
    });

    expect(response.status).toBe(202);
    expect(response.body.message).toContain("If an active account matches");
    expect(mocks.sendPasswordResetEmail).not.toHaveBeenCalled();
  });

  it("stores only a reset-token hash and sends the raw token by email", async () => {
    mocks.userFindUnique.mockResolvedValue(user);

    const response = await request(createApp()).post("/api/auth/forgot-password").send({
      email: user.email,
    });

    expect(response.status).toBe(202);
    const createCall = mocks.resetTokenCreate.mock.calls[0][0];
    const emailedToken = mocks.sendPasswordResetEmail.mock.calls[0][1];
    expect(createCall.data.tokenHash).toBe(hashSecureToken(emailedToken));
    expect(createCall.data).not.toHaveProperty("token");
  });

  it("consumes a valid reset token, changes the password, and revokes sessions", async () => {
    mocks.resetTokenFindUnique.mockResolvedValue({
      id: "reset-id",
      userId: user.id,
      usedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
      user: { id: user.id, employee: { isActive: true } },
    });

    const response = await request(createApp()).post("/api/auth/reset-password").send({
      token: "valid-reset-token-that-is-long-enough",
      newPassword: "a-new-secure-password",
    });

    expect(response.status).toBe(204);
    expect(mocks.userUpdate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ tokenVersion: { increment: 1 } }),
    }));
    expect(mocks.refreshTokenUpdateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId: user.id, revokedAt: null },
    }));
  });
});

describe("POST /api/auth/change-password", () => {
  it("requires the current password and invalidates every existing session", async () => {
    mocks.userFindUnique
      .mockResolvedValueOnce(user)
      .mockResolvedValueOnce({ id: user.id, passwordHash });

    const response = await request(createApp())
      .post("/api/auth/change-password")
      .set("Authorization", `Bearer ${createToken()}`)
      .send({ currentPassword: "correct-password", newPassword: "a-new-secure-password" });

    expect(response.status).toBe(204);
    expect(mocks.userUpdate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ tokenVersion: { increment: 1 } }),
    }));
    expect(response.headers["set-cookie"][0]).toContain("workforce_refresh=;");
  });
});

describe("GET /api/auth/me", () => {
  it("returns 401 when the token is missing, invalid, expired, or has an old version", async () => {
    expect((await request(createApp()).get("/api/auth/me")).status).toBe(401);
    expect((await request(createApp()).get("/api/auth/me").set("Authorization", "Bearer invalid")).status).toBe(401);
    expect((await request(createApp()).get("/api/auth/me").set("Authorization", `Bearer ${createToken({ expiresIn: -1 })}`)).status).toBe(401);

    mocks.userFindUnique.mockResolvedValue({ ...user, tokenVersion: 1 });
    expect((await request(createApp()).get("/api/auth/me").set("Authorization", `Bearer ${createToken()}`)).status).toBe(401);
  });

  it("returns the authenticated user for the current token version", async () => {
    mocks.userFindUnique.mockResolvedValue(user);

    const response = await request(createApp())
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${createToken()}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ user: { id: user.id, email: user.email, role: user.role } });
  });
});

describe("role authorization middleware", () => {
  const createRoleTestApp = () => {
    const app = express();
    app.get("/admin-only", authenticate, requireRole(Role.ADMIN), (_request, response) => {
      response.status(200).json({ allowed: true });
    });
    app.use(errorHandler);
    return app;
  };

  it("enforces roles after token-version authentication", async () => {
    mocks.userFindUnique.mockResolvedValue(user);
    expect((await request(createRoleTestApp())
      .get("/admin-only")
      .set("Authorization", `Bearer ${createToken()}`)).status).toBe(403);

    const admin = { ...user, role: Role.ADMIN };
    mocks.userFindUnique.mockResolvedValue(admin);
    const adminToken = jwt.sign(
      { role: Role.ADMIN, tokenVersion: 0 },
      env.JWT_SECRET,
      { algorithm: "HS256", subject: user.id, expiresIn: "15m" },
    );
    expect((await request(createRoleTestApp())
      .get("/admin-only")
      .set("Authorization", `Bearer ${adminToken}`)).status).toBe(200);
  });
});
