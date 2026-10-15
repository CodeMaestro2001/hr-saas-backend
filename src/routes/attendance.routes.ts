import { Role } from "@prisma/client";
import { Router } from "express";

import {
  checkIn,
  checkOut,
  listAllAttendance,
  listEmployeeAttendance,
  listOwnAttendance,
  listTodayAttendance,
} from "../controllers/attendance.controller";
import { authenticate } from "../middleware/auth";
import { requireRole } from "../middleware/authorize";

export const attendanceRouter = Router();

attendanceRouter.use(authenticate);

attendanceRouter.post("/check-in", requireRole(Role.EMPLOYEE), checkIn);
attendanceRouter.post("/check-out", requireRole(Role.EMPLOYEE), checkOut);
attendanceRouter.get("/me", requireRole(Role.EMPLOYEE), listOwnAttendance);
attendanceRouter.get("/today", requireRole(Role.EMPLOYEE), listTodayAttendance);
attendanceRouter.get("/", requireRole(Role.ADMIN), listAllAttendance);
attendanceRouter.get("/employee/:id", requireRole(Role.ADMIN), listEmployeeAttendance);
