import { z } from "zod";

const email = z.string().trim().email().max(254).transform((value) => value.toLowerCase());
const password = z.string().min(8).max(72);
const fullName = z.string().trim().min(2).max(100);
const department = z.string().trim().min(2).max(100);
const jobTitle = z.string().trim().min(2).max(100);
const date = z.iso.date().transform((value) => new Date(`${value}T00:00:00.000Z`));

export const employeeIdSchema = z.string().uuid();

export const createEmployeeSchema = z.object({
  email,
  password,
  fullName,
  department,
  jobTitle,
  hireDate: date,
}).strict();

export const updateEmployeeSchema = z.object({
  email: email.optional(),
  fullName: fullName.optional(),
  department: department.optional(),
  jobTitle: jobTitle.optional(),
  hireDate: date.optional(),
}).strict().refine((data) => Object.keys(data).length > 0, {
  message: "At least one field is required",
});

export const listEmployeesSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(100).optional(),
}).strict();

export type CreateEmployeeInput = z.infer<typeof createEmployeeSchema>;
export type UpdateEmployeeInput = z.infer<typeof updateEmployeeSchema>;
export type ListEmployeesInput = z.infer<typeof listEmployeesSchema>;
