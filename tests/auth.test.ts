import { Role } from "@prisma/client";
import bcrypt from "bcrypt";
import express from "express";
import jwt from "jsonwebtoken";
import request from "supertest";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const { findUnique } = vi.hoisted(() => ({
  findUnique: vi.fn(),
}));

vi.mock("../src/lib/prisma", () => ({
  prisma: {
    user: { findUnique },
  },
}));

import { createApp } from "../src/app";
import { env } from "../src/config/env";
import { authenticate } from "../src/middleware/auth";
import { requireRole } from "../src/middleware/authorize";
import { errorHandler } from "../src/middleware/error-handler";

const user = {
  id: "155f95aa-5f32-4bc6-902b-3d4062100572",
  email: "employee@example.com",
  role: Role.EMPLOYEE,
};

let passwordHash: string;

const createToken = (options?: jwt.SignOptions) => {
  return jwt.sign({ role: user.role }, env.JWT_SECRET, {
    algorithm: "HS256",
    subject: user.id,
    expiresIn: "1h",
    ...options,
  });
};

beforeAll(async () => {
  passwordHash = await bcrypt.hash("correct-password", 4);
});

beforeEach(() => {
  findUnique.mockReset();
});

describe("POST /api/auth/login", () => {
  it("returns a one-hour JWT and a safe user for valid credentials", async () => {
    findUnique.mockResolvedValue({ ...user, passwordHash });

    const response = await request(createApp()).post("/api/auth/login").send({
      email: "EMPLOYEE@example.com",
      password: "correct-password",
    });

    expect(response.status).toBe(200);
    expect(response.body.user).toEqual(user);
    expect(response.body.user).not.toHaveProperty("passwordHash");

    const payload = jwt.verify(response.body.token, env.JWT_SECRET, {
      algorithms: ["HS256"],
    });
    expect(payload).toMatchObject({ sub: user.id, role: Role.EMPLOYEE });
    expect(typeof payload).not.toBe("string");
    if (typeof payload !== "string") {
      expect(payload.exp! - payload.iat!).toBe(3600);
    }
  });

  it.each([
    ["unknown user", false, "correct-password"],
    ["wrong password", true, "wrong-password"],
  ])("returns the same generic error for %s", async (_case, userExists, password) => {
    findUnique.mockResolvedValue(userExists ? { ...user, passwordHash } : null);

    const response = await request(createApp()).post("/api/auth/login").send({
      email: user.email,
      password,
    });

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: { message: "Invalid email or password" } });
  });
});

describe("GET /api/auth/me", () => {
  it("returns 401 when the token is missing", async () => {
    const response = await request(createApp()).get("/api/auth/me");

    expect(response.status).toBe(401);
  });

  it.each([
    ["invalid", "not-a-jwt"],
    ["expired", createToken({ expiresIn: -1 })],
  ])("returns 401 for an %s token", async (_case, token) => {
    const response = await request(createApp())
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(401);
  });

  it("returns the authenticated user without the password hash", async () => {
    findUnique.mockResolvedValue(user);

    const response = await request(createApp())
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${createToken()}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ user });
    expect(response.body.user).not.toHaveProperty("passwordHash");
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

  it("returns 403 when an employee accesses an admin-only route", async () => {
    findUnique.mockResolvedValue(user);

    const response = await request(createRoleTestApp())
      .get("/admin-only")
      .set("Authorization", `Bearer ${createToken()}`);

    expect(response.status).toBe(403);
  });

  it("allows an admin to access an admin-only route", async () => {
    findUnique.mockResolvedValue({ ...user, role: Role.ADMIN });

    const token = jwt.sign({ role: Role.ADMIN }, env.JWT_SECRET, {
      algorithm: "HS256",
      subject: user.id,
      expiresIn: "1h",
    });
    const response = await request(createRoleTestApp())
      .get("/admin-only")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ allowed: true });
  });
});
