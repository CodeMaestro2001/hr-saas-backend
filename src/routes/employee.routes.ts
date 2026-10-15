import { Role } from "@prisma/client";
import { Router } from "express";

import {
  createEmployee,
  deactivateEmployee,
  getEmployee,
  getOwnEmployee,
  listEmployees,
  updateEmployee,
} from "../controllers/employee.controller";
import { authenticate } from "../middleware/auth";
import { requireRole } from "../middleware/authorize";

export const employeeRouter = Router();

employeeRouter.use(authenticate);

employeeRouter.get("/me", getOwnEmployee);
employeeRouter.post("/", requireRole(Role.ADMIN), createEmployee);
employeeRouter.get("/", requireRole(Role.ADMIN), listEmployees);
employeeRouter.get("/:id", requireRole(Role.ADMIN), getEmployee);
employeeRouter.patch("/:id", requireRole(Role.ADMIN), updateEmployee);
employeeRouter.patch("/:id/deactivate", requireRole(Role.ADMIN), deactivateEmployee);
