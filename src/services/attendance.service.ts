import { Prisma } from "@prisma/client";

import { prisma } from "../lib/prisma";
import { AppError } from "../utils/app-error";
import type { AttendanceListInput } from "../validation/attendance.validation";

const attendanceSelect = {
  id: true,
  employeeId: true,
  checkInTime: true,
  checkOutTime: true,
  workedMinutes: true,
  createdAt: true,
  updatedAt: true,
  employee: {
    select: {
      id: true,
      fullName: true,
      department: true,
      jobTitle: true,
      user: {
        select: {
          email: true,
        },
      },
    },
  },
} satisfies Prisma.AttendanceSelect;

const getActiveEmployeeId = async (userId: string) => {
  const employee = await prisma.employee.findUnique({
    where: { userId },
    select: { id: true, isActive: true },
  });

  if (!employee || !employee.isActive) {
    throw new AppError(403, "Only active employees can use attendance");
  }

  return employee.id;
};

const getAttendanceOrThrow = async (id: string) => {
  const attendance = await prisma.attendance.findUnique({
    where: { id },
    select: attendanceSelect,
  });

  if (!attendance) {
    throw new AppError(404, "Attendance record not found");
  }

  return attendance;
};

export const checkIn = async (userId: string) => {
  const employeeId = await getActiveEmployeeId(userId);
  const openSession = await prisma.attendance.findFirst({
    where: { employeeId, checkOutTime: null },
    select: { id: true },
  });

  if (openSession) {
    throw new AppError(409, "Employee already has an open attendance session");
  }

  try {
    return await prisma.attendance.create({
      data: {
        employeeId,
        checkInTime: new Date(),
      },
      select: attendanceSelect,
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new AppError(409, "Employee already has an open attendance session");
    }

    throw error;
  }
};

export const checkOut = async (userId: string) => {
  const employeeId = await getActiveEmployeeId(userId);
  const openSession = await prisma.attendance.findFirst({
    where: { employeeId, checkOutTime: null },
    select: { id: true, checkInTime: true },
    orderBy: { checkInTime: "desc" },
  });

  if (!openSession) {
    throw new AppError(409, "No open attendance session to check out");
  }

  const checkOutTime = new Date();
  const elapsedMilliseconds = checkOutTime.getTime() - openSession.checkInTime.getTime();
  const workedMinutes = Math.max(0, Math.floor(elapsedMilliseconds / 60_000));

  const result = await prisma.attendance.updateMany({
    where: {
      id: openSession.id,
      checkOutTime: null,
    },
    data: {
      checkOutTime,
      workedMinutes,
    },
  });

  if (result.count !== 1) {
    throw new AppError(409, "Attendance session changed concurrently");
  }

  return getAttendanceOrThrow(openSession.id);
};

const listAttendance = async (
  where: Prisma.AttendanceWhereInput,
  { page, limit }: AttendanceListInput,
) => {
  const [records, total] = await prisma.$transaction([
    prisma.attendance.findMany({
      where,
      select: attendanceSelect,
      orderBy: { checkInTime: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.attendance.count({ where }),
  ]);

  return {
    data: records,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
};

export const listOwnAttendance = async (userId: string, query: AttendanceListInput) => {
  const employeeId = await getActiveEmployeeId(userId);
  return listAttendance({ employeeId }, query);
};

export const listTodayAttendance = async (userId: string) => {
  const employeeId = await getActiveEmployeeId(userId);
  const now = new Date();
  const startOfToday = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
  ));
  const startOfTomorrow = new Date(startOfToday.getTime() + 24 * 60 * 60 * 1_000);

  const records = await prisma.attendance.findMany({
    where: {
      employeeId,
      checkInTime: { lt: startOfTomorrow },
      OR: [
        { checkOutTime: null },
        { checkOutTime: { gte: startOfToday } },
      ],
    },
    select: attendanceSelect,
    orderBy: { checkInTime: "desc" },
  });

  return { data: records };
};

export const listAllAttendance = async (query: AttendanceListInput) => {
  return listAttendance({}, query);
};

export const listEmployeeAttendance = async (
  employeeId: string,
  query: AttendanceListInput,
) => {
  const employee = await prisma.employee.findUnique({
    where: { id: employeeId },
    select: { id: true },
  });

  if (!employee) {
    throw new AppError(404, "Employee not found");
  }

  return listAttendance({ employeeId }, query);
};
