import { LeaveStatus, LeaveType } from "@prisma/client";
import { z } from "zod";

const dateOnly = z.iso.date().transform((value) => new Date(`${value}T00:00:00.000Z`));

export const leaveIdSchema = z.string().uuid();

export const createLeaveSchema = z.object({
  leaveType: z.nativeEnum(LeaveType),
  startDate: dateOnly,
  endDate: dateOnly,
  reason: z.string().trim().min(3).max(500),
}).strict().refine((data) => data.endDate >= data.startDate, {
  message: "endDate must be on or after startDate",
  path: ["endDate"],
});

export const listLeavesSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.nativeEnum(LeaveStatus).optional(),
  leaveType: z.nativeEnum(LeaveType).optional(),
}).strict();

export type CreateLeaveInput = z.infer<typeof createLeaveSchema>;
export type ListLeavesInput = z.infer<typeof listLeavesSchema>;
