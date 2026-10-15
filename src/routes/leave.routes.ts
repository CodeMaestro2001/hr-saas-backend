import { Role } from "@prisma/client";
import { Router } from "express";

import {
  approveLeave,
  cancelLeave,
  createLeave,
  getLeave,
  listAllLeaves,
  listOwnLeaves,
  rejectLeave,
} from "../controllers/leave.controller";
import { authenticate } from "../middleware/auth";
import { requireRole } from "../middleware/authorize";

export const leaveRouter = Router();

leaveRouter.use(authenticate);

leaveRouter.post("/", requireRole(Role.EMPLOYEE), createLeave);
leaveRouter.get("/me", requireRole(Role.EMPLOYEE), listOwnLeaves);
leaveRouter.get("/", requireRole(Role.ADMIN), listAllLeaves);
leaveRouter.get("/:id", getLeave);
leaveRouter.patch("/:id/approve", requireRole(Role.ADMIN), approveLeave);
leaveRouter.patch("/:id/reject", requireRole(Role.ADMIN), rejectLeave);
leaveRouter.patch("/:id/cancel", requireRole(Role.EMPLOYEE), cancelLeave);
