import { Router } from "express";

import {
  changePassword,
  demoLogin,
  forgotPassword,
  getCurrentUser,
  login,
  logout,
  refresh,
  resetPassword,
} from "../controllers/auth.controller";
import { authenticate } from "../middleware/auth";
import { loginRateLimit, passwordResetRateLimit } from "../middleware/auth-rate-limit";

export const authRouter = Router();

authRouter.post("/login", loginRateLimit, login);
authRouter.post("/demo", loginRateLimit, demoLogin);
authRouter.post("/refresh", refresh);
authRouter.post("/logout", logout);
authRouter.post("/forgot-password", passwordResetRateLimit, forgotPassword);
authRouter.post("/reset-password", passwordResetRateLimit, resetPassword);
authRouter.post("/change-password", authenticate, changePassword);
authRouter.get("/me", authenticate, getCurrentUser);
