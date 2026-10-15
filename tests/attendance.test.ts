import { Prisma, Role } from "@prisma/client";
import jwt from "jsonwebtoken";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  userFindUnique: vi.fn(),
  employeeFindUnique: vi.fn(),
  attendanceFindFirst: vi.fn(),
  attendanceCreate: vi.fn(),
  attendanceUpdateMany: vi.fn(),
  attendanceFindUnique: vi.fn(),
  attendanceFindMany: vi.fn(),
  attendanceCount: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("../src/lib/prisma", () => ({
  prisma: {
    user: { findUnique: mocks.userFindUnique },
    employee: { findUnique: mocks.employeeFindUnique },
    attendance: {
      findFirst: mocks.attendanceFindFirst,
      create: mocks.attendanceCreate,
      updateMany: mocks.attendanceUpdateMany,
      findUnique: mocks.attendanceFindUnique,
      findMany: mocks.attendanceFindMany,
      count: mocks.attendanceCount,
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
const attendanceId = "aa80992c-5444-4d75-baf9-d34af497f916";

const attendance = {
  id: attendanceId,
  employeeId,
  checkInTime: new Date("2026-10-15T08:00:00.000Z"),
  checkOutTime: null,
  workedMinutes: null,
  createdAt: new Date("2026-10-15T08:00:00.000Z"),
  updatedAt: new Date("2026-10-15T08:00:00.000Z"),
  employee: {
    id: employeeId,
    fullName: "Nimal Perera",
    department: "Engineering",
    jobTitle: "Backend Engineer",
    user: { email: employeeUser.email },
  },
};

const createToken = (user: typeof adminUser | typeof employeeUser) => {
  return jwt.sign({ role: user.role }, env.JWT_SECRET, {
    algorithm: "HS256",
    subject: user.id,
    expiresIn: "1h",
  });
};

beforeEach(() => {
  vi.resetAllMocks();
  mocks.userFindUnique.mockResolvedValue(employeeUser);
  mocks.employeeFindUnique.mockResolvedValue({ id: employeeId, isActive: true });
  mocks.transaction.mockImplementation(async (operations: Promise<unknown>[]) => {
    return Promise.all(operations);
  });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("attendance management", () => {
  it("checks in an active employee using a server timestamp", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-15T08:00:00.000Z"));
    mocks.attendanceFindFirst.mockResolvedValue(null);
    mocks.attendanceCreate.mockResolvedValue(attendance);

    const response = await request(createApp())
      .post("/api/attendance/check-in")
      .set("Authorization", `Bearer ${createToken(employeeUser)}`);

    expect(response.status).toBe(201);
    expect(response.body.attendance).toMatchObject({
      id: attendanceId,
      employeeId,
      checkOutTime: null,
    });
    expect(mocks.attendanceCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: {
        employeeId,
        checkInTime: new Date("2026-10-15T08:00:00.000Z"),
      },
    }));
  });

  it("rejects a duplicate check-in when an open session exists", async () => {
    mocks.attendanceFindFirst.mockResolvedValue({ id: attendanceId });

    const response = await request(createApp())
      .post("/api/attendance/check-in")
      .set("Authorization", `Bearer ${createToken(employeeUser)}`);

    expect(response.status).toBe(409);
    expect(mocks.attendanceCreate).not.toHaveBeenCalled();
  });

  it("maps a concurrent partial-index conflict to 409", async () => {
    mocks.attendanceFindFirst.mockResolvedValue(null);
    mocks.attendanceCreate.mockRejectedValue(new Prisma.PrismaClientKnownRequestError(
      "Unique constraint failed",
      { code: "P2002", clientVersion: "6.12.0" },
    ));

    const response = await request(createApp())
      .post("/api/attendance/check-in")
      .set("Authorization", `Bearer ${createToken(employeeUser)}`);

    expect(response.status).toBe(409);
  });

  it("checks out and calculates elapsed whole minutes", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-15T09:30:00.000Z"));
    mocks.attendanceFindFirst.mockResolvedValue({
      id: attendanceId,
      checkInTime: new Date("2026-10-15T08:00:00.000Z"),
    });
    mocks.attendanceUpdateMany.mockResolvedValue({ count: 1 });
    mocks.attendanceFindUnique.mockResolvedValue({
      ...attendance,
      checkOutTime: new Date("2026-10-15T09:30:00.000Z"),
      workedMinutes: 90,
    });

    const response = await request(createApp())
      .post("/api/attendance/check-out")
      .set("Authorization", `Bearer ${createToken(employeeUser)}`);

    expect(response.status).toBe(200);
    expect(response.body.attendance.workedMinutes).toBe(90);
    expect(mocks.attendanceUpdateMany).toHaveBeenCalledWith({
      where: { id: attendanceId, checkOutTime: null },
      data: {
        checkOutTime: new Date("2026-10-15T09:30:00.000Z"),
        workedMinutes: 90,
      },
    });
  });

  it("calculates overnight attendance correctly", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-16T01:30:00.000Z"));
    mocks.attendanceFindFirst.mockResolvedValue({
      id: attendanceId,
      checkInTime: new Date("2026-10-15T23:00:00.000Z"),
    });
    mocks.attendanceUpdateMany.mockResolvedValue({ count: 1 });
    mocks.attendanceFindUnique.mockResolvedValue({
      ...attendance,
      checkInTime: new Date("2026-10-15T23:00:00.000Z"),
      checkOutTime: new Date("2026-10-16T01:30:00.000Z"),
      workedMinutes: 150,
    });

    const response = await request(createApp())
      .post("/api/attendance/check-out")
      .set("Authorization", `Bearer ${createToken(employeeUser)}`);

    expect(response.status).toBe(200);
    expect(response.body.attendance.workedMinutes).toBe(150);
  });

  it("rejects checkout without an open check-in", async () => {
    mocks.attendanceFindFirst.mockResolvedValue(null);

    const response = await request(createApp())
      .post("/api/attendance/check-out")
      .set("Authorization", `Bearer ${createToken(employeeUser)}`);

    expect(response.status).toBe(409);
    expect(mocks.attendanceUpdateMany).not.toHaveBeenCalled();
  });

  it("rejects a concurrent duplicate checkout", async () => {
    mocks.attendanceFindFirst.mockResolvedValue({
      id: attendanceId,
      checkInTime: new Date(Date.now() - 60_000),
    });
    mocks.attendanceUpdateMany.mockResolvedValue({ count: 0 });

    const response = await request(createApp())
      .post("/api/attendance/check-out")
      .set("Authorization", `Bearer ${createToken(employeeUser)}`);

    expect(response.status).toBe(409);
    expect(response.body).toEqual({
      error: { message: "Attendance session changed concurrently" },
    });
  });

  it("requires authentication", async () => {
    const response = await request(createApp()).get("/api/attendance/me");

    expect(response.status).toBe(401);
  });

  it("blocks inactive employees", async () => {
    mocks.userFindUnique.mockResolvedValue({
      ...employeeUser,
      employee: { isActive: false },
    });

    const response = await request(createApp())
      .post("/api/attendance/check-in")
      .set("Authorization", `Bearer ${createToken(employeeUser)}`);

    expect(response.status).toBe(401);
    expect(mocks.employeeFindUnique).not.toHaveBeenCalled();
  });

  it("lists only the authenticated employee's records", async () => {
    mocks.attendanceFindMany.mockResolvedValue([attendance]);
    mocks.attendanceCount.mockResolvedValue(1);

    const response = await request(createApp())
      .get("/api/attendance/me?page=1&limit=10")
      .set("Authorization", `Bearer ${createToken(employeeUser)}`);

    expect(response.status).toBe(200);
    expect(response.body.pagination).toEqual({ page: 1, limit: 10, total: 1, totalPages: 1 });
    expect(mocks.attendanceFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { employeeId },
    }));
  });

  it("includes an open overnight session in today's UTC records", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-16T01:00:00.000Z"));
    mocks.attendanceFindMany.mockResolvedValue([{
      ...attendance,
      checkInTime: new Date("2026-10-15T23:00:00.000Z"),
    }]);

    const response = await request(createApp())
      .get("/api/attendance/today")
      .set("Authorization", `Bearer ${createToken(employeeUser)}`);

    expect(response.status).toBe(200);
    expect(mocks.attendanceFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        employeeId,
        checkInTime: { lt: new Date("2026-10-17T00:00:00.000Z") },
        OR: [
          { checkOutTime: null },
          { checkOutTime: { gte: new Date("2026-10-16T00:00:00.000Z") } },
        ],
      },
    }));
  });

  it("prevents employees from viewing all attendance", async () => {
    const response = await request(createApp())
      .get("/api/attendance")
      .set("Authorization", `Bearer ${createToken(employeeUser)}`);

    expect(response.status).toBe(403);
  });

  it("allows an admin to view all attendance", async () => {
    mocks.userFindUnique.mockResolvedValue(adminUser);
    mocks.attendanceFindMany.mockResolvedValue([attendance]);
    mocks.attendanceCount.mockResolvedValue(1);

    const response = await request(createApp())
      .get("/api/attendance?page=1&limit=20")
      .set("Authorization", `Bearer ${createToken(adminUser)}`);

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(1);
  });

  it("validates employee IDs and pagination", async () => {
    mocks.userFindUnique.mockResolvedValue(adminUser);

    const response = await request(createApp())
      .get("/api/attendance/employee/not-a-uuid?page=0&limit=500")
      .set("Authorization", `Bearer ${createToken(adminUser)}`);

    expect(response.status).toBe(400);
    expect(mocks.attendanceFindMany).not.toHaveBeenCalled();
  });
});
