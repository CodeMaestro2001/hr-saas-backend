import type { RequestHandler } from "express";
import { z } from "zod";

import * as authService from "../services/auth.service";

const loginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1).max(256),
});

export const login: RequestHandler = async (request, response) => {
  const result = loginSchema.safeParse(request.body);

  if (!result.success) {
    response.status(400).json({
      error: {
        message: "Invalid request body",
        fields: result.error.flatten().fieldErrors,
      },
    });
    return;
  }

  const loginResult = await authService.login(result.data.email, result.data.password);
  response.status(200).json(loginResult);
};

export const getCurrentUser: RequestHandler = (request, response) => {
  response.status(200).json({ user: request.user });
};
