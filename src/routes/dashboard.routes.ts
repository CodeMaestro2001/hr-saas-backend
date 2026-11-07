import { Role } from "@prisma/client";
import { Router } from "express";

import {
  getAdminDashboard,
  getEmployeeDashboard,
} from "../controllers/dashboard.controller";
import { authenticate } from "../middleware/auth";
import { requireRole } from "../middleware/authorize";

export const dashboardRouter = Router();

dashboardRouter.use(authenticate);
dashboardRouter.get("/admin", requireRole(Role.ADMIN), getAdminDashboard);
dashboardRouter.get("/employee", requireRole(Role.EMPLOYEE), getEmployeeDashboard);
