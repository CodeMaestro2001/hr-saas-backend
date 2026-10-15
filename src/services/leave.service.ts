import { LeaveStatus, Prisma, Role } from "@prisma/client";

import { prisma } from "../lib/prisma";
import type { AuthUser } from "../types/auth";
import { AppError } from "../utils/app-error";
import type { CreateLeaveInput, ListLeavesInput } from "../validation/leave.validation";

const leaveSelect = {
  id: true,
  employeeId: true,
  leaveType: true,
  startDate: true,
  endDate: true,
  reason: true,
  status: true,
  reviewedById: true,
  reviewedAt: true,
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
          id: true,
          email: true,
        },
      },
    },
  },
  reviewedBy: {
    select: {
      id: true,
      email: true,
    },
  },
} satisfies Prisma.LeaveRequestSelect;

const getActiveEmployeeId = async (userId: string) => {
  const employee = await prisma.employee.findUnique({
    where: { userId },
    select: { id: true, isActive: true },
  });

  if (!employee || !employee.isActive) {
    throw new AppError(404, "Active employee profile not found");
  }

  return employee.id;
};

const getLeaveOrThrow = async (id: string) => {
  const leave = await prisma.leaveRequest.findUnique({
    where: { id },
    select: leaveSelect,
  });

  if (!leave) {
    throw new AppError(404, "Leave request not found");
  }

  return leave;
};

export const createLeave = async (userId: string, input: CreateLeaveInput) => {
  const employeeId = await getActiveEmployeeId(userId);

  try {
    return await prisma.$transaction(async (transaction) => {
      const overlap = await transaction.leaveRequest.findFirst({
        where: {
          employeeId,
          status: { in: [LeaveStatus.PENDING, LeaveStatus.APPROVED] },
          startDate: { lte: input.endDate },
          endDate: { gte: input.startDate },
        },
        select: { id: true },
      });

      if (overlap) {
        throw new AppError(409, "Leave dates overlap an active leave request");
      }

      return transaction.leaveRequest.create({
        data: {
          employeeId,
          leaveType: input.leaveType,
          startDate: input.startDate,
          endDate: input.endDate,
          reason: input.reason,
        },
        select: leaveSelect,
      });
    }, {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
      throw new AppError(409, "A conflicting leave request was submitted; please retry");
    }

    throw error;
  }
};

const listLeaves = async (where: Prisma.LeaveRequestWhereInput, query: ListLeavesInput) => {
  const filters: Prisma.LeaveRequestWhereInput = {
    ...where,
    status: query.status,
    leaveType: query.leaveType,
  };

  const [leaves, total] = await prisma.$transaction([
    prisma.leaveRequest.findMany({
      where: filters,
      select: leaveSelect,
      orderBy: { createdAt: "desc" },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    }),
    prisma.leaveRequest.count({ where: filters }),
  ]);

  return {
    data: leaves,
    pagination: {
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.ceil(total / query.limit),
    },
  };
};

export const listOwnLeaves = async (userId: string, query: ListLeavesInput) => {
  const employeeId = await getActiveEmployeeId(userId);
  return listLeaves({ employeeId }, query);
};

export const listAllLeaves = async (query: ListLeavesInput) => {
  return listLeaves({}, query);
};

export const getLeave = async (id: string, user: AuthUser) => {
  const leave = await getLeaveOrThrow(id);
  const isOwner = leave.employee.user.id === user.id;

  if (user.role !== Role.ADMIN && !isOwner) {
    throw new AppError(403, "Insufficient permissions");
  }

  return leave;
};

const reviewLeave = async (
  id: string,
  reviewerId: string,
  status: typeof LeaveStatus.APPROVED | typeof LeaveStatus.REJECTED,
) => {
  const existing = await prisma.leaveRequest.findUnique({
    where: { id },
    select: { id: true, status: true },
  });

  if (!existing) {
    throw new AppError(404, "Leave request not found");
  }
  if (existing.status !== LeaveStatus.PENDING) {
    throw new AppError(409, "Only pending leave requests can be reviewed");
  }

  const result = await prisma.leaveRequest.updateMany({
    where: { id, status: LeaveStatus.PENDING },
    data: {
      status,
      reviewedById: reviewerId,
      reviewedAt: new Date(),
    },
  });

  if (result.count !== 1) {
    throw new AppError(409, "Leave request status changed concurrently");
  }

  return getLeaveOrThrow(id);
};

export const approveLeave = async (id: string, reviewerId: string) => {
  return reviewLeave(id, reviewerId, LeaveStatus.APPROVED);
};

export const rejectLeave = async (id: string, reviewerId: string) => {
  return reviewLeave(id, reviewerId, LeaveStatus.REJECTED);
};

export const cancelLeave = async (id: string, userId: string) => {
  const existing = await prisma.leaveRequest.findUnique({
    where: { id },
    select: {
      id: true,
      status: true,
      employee: {
        select: {
          userId: true,
        },
      },
    },
  });

  if (!existing) {
    throw new AppError(404, "Leave request not found");
  }
  if (existing.employee.userId !== userId) {
    throw new AppError(403, "Only the leave owner can cancel this request");
  }
  if (existing.status !== LeaveStatus.PENDING) {
    throw new AppError(409, "Only pending leave requests can be cancelled");
  }

  const result = await prisma.leaveRequest.updateMany({
    where: { id, status: LeaveStatus.PENDING },
    data: { status: LeaveStatus.CANCELLED },
  });

  if (result.count !== 1) {
    throw new AppError(409, "Leave request status changed concurrently");
  }

  return getLeaveOrThrow(id);
};
