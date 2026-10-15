import { z } from "zod";

export const employeeIdSchema = z.string().uuid();

export const attendanceListSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
}).strict();

export type AttendanceListInput = z.infer<typeof attendanceListSchema>;
