import { z } from "zod";

export const passwordSchema = z.string()
  .min(12, "Password must contain at least 12 characters")
  .max(72, "Password must contain at most 72 characters");

export const loginSchema = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(1).max(256),
}).strict();

export const forgotPasswordSchema = z.object({
  email: z.string().trim().email().max(254),
}).strict();

export const resetPasswordSchema = z.object({
  token: z.string().trim().min(32).max(256),
  newPassword: passwordSchema,
}).strict();

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(256),
  newPassword: passwordSchema,
}).strict().refine(
  ({ currentPassword, newPassword }) => currentPassword !== newPassword,
  { path: ["newPassword"], message: "New password must be different" },
);

export type LoginInput = z.infer<typeof loginSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
