import { Prisma, Role } from "@prisma/client";
import jwt from "jsonwebtoken";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  userFindUnique: vi.fn(),
  userCreate: vi.fn(),
  employeeFindUnique: vi.fn(),
  employeeFindMany: vi.fn(),
  employeeCount: vi.fn(),
  employeeUpdate: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("../src/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: mocks.userFindUnique,
      create: mocks.userCreate,
    },
    employee: {
      findUnique: mocks.employeeFindUnique,
      findMany: mocks.employeeFindMany,
      count: mocks.employeeCount,
      update: mocks.employeeUpdate,
    },
    $transaction: mocks.transaction,
  },
}));

import { createApp } from "../src/app";
import { env } from "../src/config/env";

const adminUser = {
  id: "2eb73bdb-a8a5-4bb9-a181-7dc8567d2508",
  email: "admin@example.com",
  role: Role.ADMIN,
  employee: null,
};

const employeeUser = {
  id: "ad1d9ca2-eaa9-4394-bdf8-ac73cec73c75",
  email: "employee@example.com",
  role: Role.EMPLOYEE,
  employee: { isActive: true },
};

const employeeId = "8f22ac1e-a1b8-4176-a3fd-e83a0e156446";
const dates = {
  hireDate: new Date("2025-01-15T00:00:00.000Z"),
  createdAt: new Date("2025-01-01T00:00:00.000Z"),
  updatedAt: new Date("2025-01-01T00:00:00.000Z"),
};

const selectedEmployee = {
  id: employeeId,
  userId: employeeUser.id,
  fullName: "Nimal Perera",
  department: "Engineering",
  jobTitle: "Backend Engineer",
  isActive: true,
  ...dates,
  user: { email: employeeUser.email },
};

const createToken = (user: typeof adminUser | typeof employeeUser) => {
  return jwt.sign({ role: user.role }, env.JWT_SECRET, {
    algorithm: "HS256",
    subject: user.id,
    expiresIn: "1h",
  });
};

const adminToken = createToken(adminUser);
const employeeToken = createToken(employeeUser);

const validCreateBody = {
  email: employeeUser.email,
  password: "initial-password",
  fullName: "Nimal Perera",
  department: "Engineering",
  jobTitle: "Backend Engineer",
  hireDate: "2025-01-15",
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.userFindUnique.mockResolvedValue(adminUser);
  mocks.transaction.mockImplementation(async (operations: Promise<unknown>[]) => {
    return Promise.all(operations);
  });
});

describe("employee management", () => {
  it("allows an admin to atomically create an employee account", async () => {
    mocks.userCreate.mockResolvedValue({
      id: employeeUser.id,
      email: employeeUser.email,
      employee: {
        id: employeeId,
        fullName: selectedEmployee.fullName,
        department: selectedEmployee.department,
        jobTitle: selectedEmployee.jobTitle,
        isActive: true,
        ...dates,
      },
    });

    const response = await request(createApp())
      .post("/api/employees")
      .set("Authorization", `Bearer ${adminToken}`)
      .send(validCreateBody);

    expect(response.status).toBe(201);
    expect(response.body.employee).toMatchObject({
      id: employeeId,
      email: employeeUser.email,
      isActive: true,
    });
    expect(response.body.employee).not.toHaveProperty("passwordHash");
    expect(mocks.userCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        email: employeeUser.email,
        role: Role.EMPLOYEE,
        passwordHash: expect.not.stringContaining("initial-password"),
        employee: { create: expect.any(Object) },
      }),
    }));
  });

  it("rejects invalid dates and fields", async () => {
    const response = await request(createApp())
      .post("/api/employees")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ ...validCreateBody, fullName: "N", hireDate: "2025-02-30" });

    expect(response.status).toBe(400);
    expect(mocks.userCreate).not.toHaveBeenCalled();
  });

  it("does not allow the client to assign the ADMIN role", async () => {
    const response = await request(createApp())
      .post("/api/employees")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ ...validCreateBody, role: Role.ADMIN });

    expect(response.status).toBe(400);
    expect(mocks.userCreate).not.toHaveBeenCalled();
  });

  it("returns 409 for a duplicate email", async () => {
    mocks.userCreate.mockRejectedValue(new Prisma.PrismaClientKnownRequestError(
      "Unique constraint failed",
      { code: "P2002", clientVersion: "6.12.0", meta: { target: ["email"] } },
    ));

    const response = await request(createApp())
      .post("/api/employees")
      .set("Authorization", `Bearer ${adminToken}`)
      .send(validCreateBody);

    expect(response.status).toBe(409);
    expect(response.body).toEqual({ error: { message: "Email already in use" } });
  });

  it("lists employees with bounded pagination and search", async () => {
    mocks.employeeFindMany.mockResolvedValue([selectedEmployee]);
    mocks.employeeCount.mockResolvedValue(1);

    const response = await request(createApp())
      .get("/api/employees?page=1&limit=10&search=nimal")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(response.status).toBe(200);
    expect(response.body.pagination).toEqual({ page: 1, limit: 10, total: 1, totalPages: 1 });
    expect(response.body.data[0]).toMatchObject({ id: employeeId, email: employeeUser.email });
    expect(mocks.employeeFindMany).toHaveBeenCalledWith(expect.objectContaining({
      skip: 0,
      take: 10,
      where: expect.objectContaining({ OR: expect.any(Array) }),
    }));
  });

  it("allows an employee to view only their own profile", async () => {
    mocks.userFindUnique.mockResolvedValue(employeeUser);
    mocks.employeeFindUnique.mockResolvedValue(selectedEmployee);

    const response = await request(createApp())
      .get("/api/employees/me")
      .set("Authorization", `Bearer ${employeeToken}`);

    expect(response.status).toBe(200);
    expect(response.body.employee).toMatchObject({
      userId: employeeUser.id,
      email: employeeUser.email,
    });
    expect(mocks.employeeFindUnique).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId: employeeUser.id },
    }));
  });

  it("prevents an employee from managing another employee", async () => {
    mocks.userFindUnique.mockResolvedValue(employeeUser);

    const response = await request(createApp())
      .patch(`/api/employees/${employeeId}`)
      .set("Authorization", `Bearer ${employeeToken}`)
      .send({ jobTitle: "Manager" });

    expect(response.status).toBe(403);
    expect(mocks.employeeUpdate).not.toHaveBeenCalled();
  });

  it("allows an admin to update an employee", async () => {
    mocks.employeeUpdate.mockResolvedValue({
      ...selectedEmployee,
      jobTitle: "Senior Backend Engineer",
    });

    const response = await request(createApp())
      .patch(`/api/employees/${employeeId}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ jobTitle: "Senior Backend Engineer" });

    expect(response.status).toBe(200);
    expect(response.body.employee.jobTitle).toBe("Senior Backend Engineer");
  });

  it("soft-deactivates an employee", async () => {
    mocks.employeeUpdate.mockResolvedValue({ ...selectedEmployee, isActive: false });

    const response = await request(createApp())
      .patch(`/api/employees/${employeeId}/deactivate`)
      .set("Authorization", `Bearer ${adminToken}`);

    expect(response.status).toBe(200);
    expect(response.body.employee.isActive).toBe(false);
    expect(mocks.employeeUpdate).toHaveBeenCalledWith(expect.objectContaining({
      data: { isActive: false },
    }));
  });

  it("blocks protected API access for a deactivated employee", async () => {
    mocks.userFindUnique.mockResolvedValue({
      ...employeeUser,
      employee: { isActive: false },
    });

    const response = await request(createApp())
      .get("/api/employees/me")
      .set("Authorization", `Bearer ${employeeToken}`);

    expect(response.status).toBe(401);
    expect(mocks.employeeFindUnique).not.toHaveBeenCalled();
  });

  it("blocks login for a deactivated employee", async () => {
    mocks.userFindUnique.mockResolvedValue({
      ...employeeUser,
      passwordHash: "unused-for-deactivated-user",
      employee: { isActive: false },
    });

    const response = await request(createApp()).post("/api/auth/login").send({
      email: employeeUser.email,
      password: "initial-password",
    });

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: { message: "Invalid email or password" } });
  });
});
