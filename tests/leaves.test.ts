import { LeaveStatus, LeaveType, Prisma, Role } from "@prisma/client";
import jwt from "jsonwebtoken";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  userFindUnique: vi.fn(),
  employeeFindUnique: vi.fn(),
  leaveFindFirst: vi.fn(),
  leaveCreate: vi.fn(),
  leaveFindMany: vi.fn(),
  leaveCount: vi.fn(),
  leaveFindUnique: vi.fn(),
  leaveUpdateMany: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("../src/lib/prisma", () => ({
  prisma: {
    user: { findUnique: mocks.userFindUnique },
    employee: { findUnique: mocks.employeeFindUnique },
    leaveRequest: {
      findFirst: mocks.leaveFindFirst,
      create: mocks.leaveCreate,
      findMany: mocks.leaveFindMany,
      count: mocks.leaveCount,
      findUnique: mocks.leaveFindUnique,
      updateMany: mocks.leaveUpdateMany,
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
const leaveId = "e8c3ca90-3061-4c04-bd5a-778176a1cc45";

const leave = {
  id: leaveId,
  employeeId,
  leaveType: LeaveType.ANNUAL,
  startDate: new Date("2026-11-02T00:00:00.000Z"),
  endDate: new Date("2026-11-04T00:00:00.000Z"),
  reason: "Family event",
  status: LeaveStatus.PENDING,
  reviewedById: null,
  reviewedAt: null,
  createdAt: new Date("2026-10-15T00:00:00.000Z"),
  updatedAt: new Date("2026-10-15T00:00:00.000Z"),
  employee: {
    id: employeeId,
    fullName: "Nimal Perera",
    department: "Engineering",
    jobTitle: "Backend Engineer",
    user: {
      id: employeeUser.id,
      email: employeeUser.email,
    },
  },
  reviewedBy: null,
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

const createBody = {
  leaveType: LeaveType.ANNUAL,
  startDate: "2026-11-02",
  endDate: "2026-11-04",
  reason: "Family event",
};

beforeEach(() => {
  vi.resetAllMocks();
  mocks.userFindUnique.mockResolvedValue(employeeUser);
  mocks.employeeFindUnique.mockResolvedValue({ id: employeeId, isActive: true });
  mocks.transaction.mockImplementation(async (
    input: Promise<unknown>[] | ((transaction: unknown) => Promise<unknown>),
  ) => {
    if (typeof input === "function") {
      return input({
        leaveRequest: {
          findFirst: mocks.leaveFindFirst,
          create: mocks.leaveCreate,
        },
      });
    }
    return Promise.all(input);
  });
});

describe("leave management", () => {
  it("lets an employee submit leave using their database identity", async () => {
    mocks.leaveFindFirst.mockResolvedValue(null);
    mocks.leaveCreate.mockResolvedValue(leave);

    const response = await request(createApp())
      .post("/api/leaves")
      .set("Authorization", `Bearer ${employeeToken}`)
      .send(createBody);

    expect(response.status).toBe(201);
    expect(response.body.leave).toMatchObject({
      id: leaveId,
      employeeId,
      leaveType: LeaveType.ANNUAL,
      status: LeaveStatus.PENDING,
    });
    expect(mocks.employeeFindUnique).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId: employeeUser.id },
    }));
    expect(mocks.leaveCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        employeeId,
        startDate: new Date("2026-11-02T00:00:00.000Z"),
        endDate: new Date("2026-11-04T00:00:00.000Z"),
      }),
    }));
    expect(mocks.transaction).toHaveBeenCalledWith(
      expect.any(Function),
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  });

  it.each([
    ["reversed dates", { ...createBody, startDate: "2026-11-05", endDate: "2026-11-04" }],
    ["invalid calendar date", { ...createBody, startDate: "2026-02-30" }],
    ["invalid leave type", { ...createBody, leaveType: "UNPAID" }],
  ])("rejects %s", async (_case, body) => {
    const response = await request(createApp())
      .post("/api/leaves")
      .set("Authorization", `Bearer ${employeeToken}`)
      .send(body);

    expect(response.status).toBe(400);
    expect(mocks.leaveCreate).not.toHaveBeenCalled();
  });

  it("rejects an overlapping pending or approved leave", async () => {
    mocks.leaveFindFirst.mockResolvedValue({ id: "overlapping-leave" });

    const response = await request(createApp())
      .post("/api/leaves")
      .set("Authorization", `Bearer ${employeeToken}`)
      .send(createBody);

    expect(response.status).toBe(409);
    expect(response.body).toEqual({
      error: { message: "Leave dates overlap an active leave request" },
    });
    expect(mocks.leaveCreate).not.toHaveBeenCalled();
  });

  it("requires authentication", async () => {
    const response = await request(createApp()).get("/api/leaves/me");

    expect(response.status).toBe(401);
  });

  it("lists only the authenticated employee's leave requests", async () => {
    mocks.leaveFindMany.mockResolvedValue([leave]);
    mocks.leaveCount.mockResolvedValue(1);

    const response = await request(createApp())
      .get("/api/leaves/me?page=1&limit=10")
      .set("Authorization", `Bearer ${employeeToken}`);

    expect(response.status).toBe(200);
    expect(response.body.pagination).toEqual({ page: 1, limit: 10, total: 1, totalPages: 1 });
    expect(mocks.leaveFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ employeeId }),
    }));
  });

  it("allows an admin to list all leave requests", async () => {
    mocks.userFindUnique.mockResolvedValue(adminUser);
    mocks.leaveFindMany.mockResolvedValue([leave]);
    mocks.leaveCount.mockResolvedValue(1);

    const response = await request(createApp())
      .get("/api/leaves?status=PENDING&leaveType=ANNUAL")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(1);
  });

  it("prevents an employee from listing all leave requests", async () => {
    const response = await request(createApp())
      .get("/api/leaves")
      .set("Authorization", `Bearer ${employeeToken}`);

    expect(response.status).toBe(403);
    expect(mocks.leaveFindMany).not.toHaveBeenCalled();
  });

  it("prevents an employee from viewing another employee's leave", async () => {
    mocks.leaveFindUnique.mockResolvedValue({
      ...leave,
      employee: {
        ...leave.employee,
        user: { id: "61836e7c-d704-440c-bd12-aeca1c58517e", email: "other@example.com" },
      },
    });

    const response = await request(createApp())
      .get(`/api/leaves/${leaveId}`)
      .set("Authorization", `Bearer ${employeeToken}`);

    expect(response.status).toBe(403);
  });

  it.each([
    ["approve", LeaveStatus.APPROVED],
    ["reject", LeaveStatus.REJECTED],
  ])("allows an admin to %s a pending leave", async (action, status) => {
    mocks.userFindUnique.mockResolvedValue(adminUser);
    mocks.leaveFindUnique
      .mockResolvedValueOnce({ id: leaveId, status: LeaveStatus.PENDING })
      .mockResolvedValueOnce({
        ...leave,
        status,
        reviewedById: adminUser.id,
        reviewedAt: new Date(),
        reviewedBy: { id: adminUser.id, email: adminUser.email },
      });
    mocks.leaveUpdateMany.mockResolvedValue({ count: 1 });

    const response = await request(createApp())
      .patch(`/api/leaves/${leaveId}/${action}`)
      .set("Authorization", `Bearer ${adminToken}`);

    expect(response.status).toBe(200);
    expect(response.body.leave.status).toBe(status);
    expect(mocks.leaveUpdateMany).toHaveBeenCalledWith({
      where: { id: leaveId, status: LeaveStatus.PENDING },
      data: {
        status,
        reviewedById: adminUser.id,
        reviewedAt: expect.any(Date),
      },
    });
  });

  it("returns 409 when another status update wins concurrently", async () => {
    mocks.userFindUnique.mockResolvedValue(adminUser);
    mocks.leaveFindUnique.mockResolvedValue({ id: leaveId, status: LeaveStatus.PENDING });
    mocks.leaveUpdateMany.mockResolvedValue({ count: 0 });

    const response = await request(createApp())
      .patch(`/api/leaves/${leaveId}/approve`)
      .set("Authorization", `Bearer ${adminToken}`);

    expect(response.status).toBe(409);
    expect(response.body).toEqual({
      error: { message: "Leave request status changed concurrently" },
    });
  });

  it("allows the owner to cancel their pending leave", async () => {
    mocks.leaveFindUnique
      .mockResolvedValueOnce({
        id: leaveId,
        status: LeaveStatus.PENDING,
        employee: { userId: employeeUser.id },
      })
      .mockResolvedValueOnce({ ...leave, status: LeaveStatus.CANCELLED });
    mocks.leaveUpdateMany.mockResolvedValue({ count: 1 });

    const response = await request(createApp())
      .patch(`/api/leaves/${leaveId}/cancel`)
      .set("Authorization", `Bearer ${employeeToken}`);

    expect(response.status).toBe(200);
    expect(response.body.leave.status).toBe(LeaveStatus.CANCELLED);
  });

  it("prevents a non-owner from cancelling leave", async () => {
    mocks.leaveFindUnique.mockResolvedValue({
      id: leaveId,
      status: LeaveStatus.PENDING,
      employee: { userId: "61836e7c-d704-440c-bd12-aeca1c58517e" },
    });

    const response = await request(createApp())
      .patch(`/api/leaves/${leaveId}/cancel`)
      .set("Authorization", `Bearer ${employeeToken}`);

    expect(response.status).toBe(403);
    expect(mocks.leaveUpdateMany).not.toHaveBeenCalled();
  });

  it("prevents cancelling an approved leave", async () => {
    mocks.leaveFindUnique.mockResolvedValue({
      id: leaveId,
      status: LeaveStatus.APPROVED,
      employee: { userId: employeeUser.id },
    });

    const response = await request(createApp())
      .patch(`/api/leaves/${leaveId}/cancel`)
      .set("Authorization", `Bearer ${employeeToken}`);

    expect(response.status).toBe(409);
    expect(mocks.leaveUpdateMany).not.toHaveBeenCalled();
  });

  it("prevents an employee from approving leave", async () => {
    const response = await request(createApp())
      .patch(`/api/leaves/${leaveId}/approve`)
      .set("Authorization", `Bearer ${employeeToken}`);

    expect(response.status).toBe(403);
    expect(mocks.leaveUpdateMany).not.toHaveBeenCalled();
  });

  it("prevents changing a non-pending leave", async () => {
    mocks.userFindUnique.mockResolvedValue(adminUser);
    mocks.leaveFindUnique.mockResolvedValue({ id: leaveId, status: LeaveStatus.APPROVED });

    const response = await request(createApp())
      .patch(`/api/leaves/${leaveId}/reject`)
      .set("Authorization", `Bearer ${adminToken}`);

    expect(response.status).toBe(409);
    expect(mocks.leaveUpdateMany).not.toHaveBeenCalled();
  });
});
