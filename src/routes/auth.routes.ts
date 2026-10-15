import { Router } from "express";

import { getCurrentUser, login } from "../controllers/auth.controller";
import { authenticate } from "../middleware/auth";

export const authRouter = Router();

authRouter.post("/login", login);
authRouter.get("/me", authenticate, getCurrentUser);
