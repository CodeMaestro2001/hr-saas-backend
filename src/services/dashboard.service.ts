import { LeaveStatus, LeaveType } from "@prisma/client";

import { env } from "../config/env";
import { prisma } from "../lib/prisma";
import { AppError } from "../utils/app-error";

const startOfUtcDay = (date: Date) => new Date(Date.UTC(
  date.getUTCFullYear(),
  date.getUTCMonth(),
  date.getUTCDate(),
));

const addUtcDays = (date: Date, days: number) => new Date(date.getTime() + days * 86_400_000);

const inclusiveDaysWithin = (start: Date, end: Date, rangeStart: Date, rangeEnd: Date) => {
  const clippedStart = Math.max(start.getTime(), rangeStart.getTime());
  const clippedEnd = Math.min(end.getTime(), rangeEnd.getTime());
  if (clippedStart > clippedEnd) return 0;
  return Math.floor((clippedEnd - clippedStart) / 86_400_000) + 1;
};

export const getAdminSummary = async (now = new Date()) => {
  const todayStart = startOfUtcDay(now);
  const tomorrowStart = addUtcDays(todayStart, 1);

  const [activeEmployees, presentRows, openSessions, pendingLeaveCount] = await Promise.all([
    prisma.employee.count({ where: { isActive: true } }),
    prisma.attendance.findMany({
      where: {
        employee: { isActive: true },
        checkInTime: { lt: tomorrowStart },
        OR: [
          { checkOutTime: null },
          { checkOutTime: { gte: todayStart } },
        ],
      },
      select: { employeeId: true },
      distinct: ["employeeId"],
    }),
    prisma.attendance.findMany({
      where: {
        checkOutTime: null,
        employee: { isActive: true },
      },
      select: {
        id: true,
        checkInTime: true,
        employee: {
          select: {
            id: true,
            fullName: true,
            department: true,
            jobTitle: true,
          },
        },
      },
      orderBy: { checkInTime: "desc" },
    }),
    prisma.leaveRequest.count({ where: { status: LeaveStatus.PENDING } }),
  ]);

  const presentToday = presentRows.length;
  return {
    asOf: now,
    timeZone: "UTC",
    activeEmployees,
    presentToday,
    absentToday: Math.max(activeEmployees - presentToday, 0),
    pendingLeaveCount,
    currentlyCheckedIn: {
      count: openSessions.length,
      employees: openSessions.map((session) => ({
        attendanceId: session.id,
        checkInTime: session.checkInTime,
        ...session.employee,
      })),
    },
  };
};

const leaveAllowances: Record<LeaveType, number> = {
  [LeaveType.ANNUAL]: env.ANNUAL_LEAVE_ALLOWANCE,
  [LeaveType.SICK]: env.SICK_LEAVE_ALLOWANCE,
  [LeaveType.CASUAL]: env.CASUAL_LEAVE_ALLOWANCE,
};

export const getEmployeeSummary = async (userId: string, now = new Date()) => {
  const employee = await prisma.employee.findUnique({
    where: { userId },
    select: {
      id: true,
      fullName: true,
      department: true,
      jobTitle: true,
      isActive: true,
    },
  });

  if (!employee || !employee.isActive) {
    throw new AppError(404, "Active employee profile not found");
  }

  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const nextMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  const yearStart = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
  const yearEnd = new Date(Date.UTC(now.getUTCFullYear(), 11, 31));
  const todayStart = startOfUtcDay(now);

  const [monthlyAttendance, approvedLeaves, upcomingApprovedLeave, openAttendance, pendingLeaveCount] = await Promise.all([
    prisma.attendance.findMany({
      where: {
        employeeId: employee.id,
        checkInTime: { lt: nextMonthStart },
        OR: [
          { checkOutTime: null },
          { checkOutTime: { gte: monthStart } },
        ],
      },
      select: {
        id: true,
        checkInTime: true,
        checkOutTime: true,
        workedMinutes: true,
      },
      orderBy: { checkInTime: "asc" },
    }),
    prisma.leaveRequest.findMany({
      where: {
        employeeId: employee.id,
        status: LeaveStatus.APPROVED,
        startDate: { lte: yearEnd },
        endDate: { gte: yearStart },
      },
      select: { leaveType: true, startDate: true, endDate: true },
    }),
    prisma.leaveRequest.findFirst({
      where: {
        employeeId: employee.id,
        status: LeaveStatus.APPROVED,
        endDate: { gte: todayStart },
      },
      select: {
        id: true,
        leaveType: true,
        startDate: true,
        endDate: true,
        reason: true,
      },
      orderBy: [{ startDate: "asc" }, { createdAt: "asc" }],
    }),
    prisma.attendance.findFirst({
      where: { employeeId: employee.id, checkOutTime: null },
      select: { id: true, checkInTime: true },
      orderBy: { checkInTime: "desc" },
    }),
    prisma.leaveRequest.count({
      where: { employeeId: employee.id, status: LeaveStatus.PENDING },
    }),
  ]);

  const presentDates = new Set<string>();
  for (const attendance of monthlyAttendance) {
    const overlapStart = new Date(Math.max(attendance.checkInTime.getTime(), monthStart.getTime()));
    const overlapEnd = new Date(Math.min(
      (attendance.checkOutTime ?? now).getTime(),
      nextMonthStart.getTime() - 1,
    ));
    for (let day = startOfUtcDay(overlapStart); day <= overlapEnd; day = addUtcDays(day, 1)) {
      presentDates.add(day.toISOString().slice(0, 10));
    }
  }

  const usedByType: Record<LeaveType, number> = {
    [LeaveType.ANNUAL]: 0,
    [LeaveType.SICK]: 0,
    [LeaveType.CASUAL]: 0,
  };
  for (const leave of approvedLeaves) {
    usedByType[leave.leaveType] += inclusiveDaysWithin(
      leave.startDate,
      leave.endDate,
      yearStart,
      yearEnd,
    );
  }

  const leaveBalance = Object.values(LeaveType).map((leaveType) => ({
    leaveType,
    allowance: leaveAllowances[leaveType],
    used: usedByType[leaveType],
    remaining: Math.max(leaveAllowances[leaveType] - usedByType[leaveType], 0),
  }));

  return {
    asOf: now,
    timeZone: "UTC",
    year: now.getUTCFullYear(),
    employee: {
      id: employee.id,
      fullName: employee.fullName,
      department: employee.department,
      jobTitle: employee.jobTitle,
    },
    monthlyAttendance: {
      month: monthStart.toISOString().slice(0, 7),
      presentDays: presentDates.size,
      sessions: monthlyAttendance.length,
      workedMinutes: monthlyAttendance.reduce((total, item) => total + (item.workedMinutes ?? 0), 0),
    },
    leaveBalance,
    totalRemainingLeave: leaveBalance.reduce((total, item) => total + item.remaining, 0),
    upcomingApprovedLeave,
    currentAttendance: openAttendance
      ? { status: "CHECKED_IN" as const, ...openAttendance }
      : { status: "NOT_CHECKED_IN" as const },
    pendingLeaveCount,
  };
};
