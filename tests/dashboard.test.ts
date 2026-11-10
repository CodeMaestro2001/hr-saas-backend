import { LeaveStatus, LeaveType, Role } from "@prisma/client";
import jwt from "jsonwebtoken";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  userFindUnique: vi.fn(),
  employeeCount: vi.fn(),
  employeeFindUnique: vi.fn(),
  attendanceFindMany: vi.fn(),
  attendanceFindFirst: vi.fn(),
  leaveCount: vi.fn(),
  leaveFindMany: vi.fn(),
  leaveFindFirst: vi.fn(),
}));

vi.mock("../src/lib/prisma", () => ({
  prisma: {
    user: { findUnique: mocks.userFindUnique },
    employee: {
      count: mocks.employeeCount,
      findUnique: mocks.employeeFindUnique,
    },
    attendance: {
      findMany: mocks.attendanceFindMany,
      findFirst: mocks.attendanceFindFirst,
    },
    leaveRequest: {
      count: mocks.leaveCount,
      findMany: mocks.leaveFindMany,
      findFirst: mocks.leaveFindFirst,
    },
  },
}));

import { createApp } from "../src/app";
import { env } from "../src/config/env";

const admin = {
  id: "2eb73bdb-a8a5-4bb9-a181-7dc8567d2508",
  email: "admin@example.com",
  role: Role.ADMIN,
  tokenVersion: 0,
  employee: null,
};
const employeeUser = {
  id: "ad1d9ca2-eaa9-4394-bdf8-ac73cec73c75",
  email: "employee@example.com",
  role: Role.EMPLOYEE,
  tokenVersion: 0,
  employee: { isActive: true },
};
const employeeId = "8f22ac1e-a1b8-4176-a3fd-e83a0e156446";

const tokenFor = (user: typeof admin | typeof employeeUser) => jwt.sign(
  { role: user.role, tokenVersion: user.tokenVersion },
  env.JWT_SECRET,
  { algorithm: "HS256", subject: user.id, expiresIn: "15m" },
);

beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-07T10:30:00.000Z"));
});

afterEach(() => vi.useRealTimers());

describe("dashboard summaries", () => {
  it("returns real-time admin attendance and leave counts", async () => {
    mocks.userFindUnique.mockResolvedValue(admin);
    mocks.employeeCount.mockResolvedValue(5);
    mocks.attendanceFindMany
      .mockResolvedValueOnce([{ employeeId: "one" }, { employeeId: "two" }, { employeeId: "three" }])
      .mockResolvedValueOnce([{
        id: "attendance-id",
        checkInTime: new Date("2026-11-07T08:00:00.000Z"),
        employee: {
          id: employeeId,
          fullName: "Demo Employee",
          department: "Engineering",
          jobTitle: "Software Engineer",
        },
      }]);
    mocks.leaveCount.mockResolvedValue(2);

    const response = await request(createApp())
      .get("/api/dashboard/admin")
      .set("Authorization", `Bearer ${tokenFor(admin)}`);

    expect(response.status).toBe(200);
    expect(response.body.summary).toMatchObject({
      activeEmployees: 5,
      presentToday: 3,
      absentToday: 2,
      pendingLeaveCount: 2,
      currentlyCheckedIn: { count: 1 },
    });
    expect(response.body.summary.currentlyCheckedIn.employees[0].fullName).toBe("Demo Employee");
  });

  it("returns calculated employee monthly attendance and leave balances", async () => {
    mocks.userFindUnique.mockResolvedValue(employeeUser);
    mocks.employeeFindUnique.mockResolvedValue({
      id: employeeId,
      fullName: "Demo Employee",
      department: "Engineering",
      jobTitle: "Software Engineer",
      isActive: true,
    });
    mocks.attendanceFindMany.mockResolvedValue([
      {
        id: "one",
        checkInTime: new Date("2026-11-03T08:00:00.000Z"),
        checkOutTime: new Date("2026-11-03T16:00:00.000Z"),
        workedMinutes: 480,
      },
      {
        id: "two",
        checkInTime: new Date("2026-11-04T08:00:00.000Z"),
        checkOutTime: new Date("2026-11-04T16:00:00.000Z"),
        workedMinutes: 480,
      },
    ]);
    mocks.leaveFindMany.mockResolvedValue([
      {
        leaveType: LeaveType.ANNUAL,
        startDate: new Date("2026-08-10T00:00:00.000Z"),
        endDate: new Date("2026-08-12T00:00:00.000Z"),
      },
    ]);
    mocks.leaveFindFirst.mockResolvedValue({
      id: "leave-id",
      leaveType: LeaveType.CASUAL,
      startDate: new Date("2026-11-20T00:00:00.000Z"),
      endDate: new Date("2026-11-20T00:00:00.000Z"),
      reason: "Appointment",
      status: LeaveStatus.APPROVED,
    });
    mocks.attendanceFindFirst.mockResolvedValue(null);
    mocks.leaveCount.mockResolvedValue(1);

    const response = await request(createApp())
      .get("/api/dashboard/employee")
      .set("Authorization", `Bearer ${tokenFor(employeeUser)}`);

    expect(response.status).toBe(200);
    expect(response.body.summary.monthlyAttendance).toEqual({
      month: "2026-11",
      presentDays: 2,
      sessions: 2,
      workedMinutes: 960,
    });
    expect(response.body.summary.leaveBalance).toContainEqual({
      leaveType: LeaveType.ANNUAL,
      allowance: env.ANNUAL_LEAVE_ALLOWANCE,
      used: 3,
      remaining: env.ANNUAL_LEAVE_ALLOWANCE - 3,
    });
    expect(response.body.summary.upcomingApprovedLeave.id).toBe("leave-id");
  });

  it("forbids employees from the admin dashboard", async () => {
    mocks.userFindUnique.mockResolvedValue(employeeUser);
    expect((await request(createApp())
      .get("/api/dashboard/admin")
      .set("Authorization", `Bearer ${tokenFor(employeeUser)}`)).status).toBe(403);
  });

});
