import type { ErrorRequestHandler, RequestHandler } from "express";

import { AppError } from "../utils/app-error";

export const notFoundHandler: RequestHandler = (_request, response) => {
  response.status(404).json({
    error: {
      message: "Route not found",
    },
  });
};

export const errorHandler: ErrorRequestHandler = (error, _request, response, _next) => {
  if (error instanceof AppError) {
    response.status(error.statusCode).json({
      error: {
        message: error.message,
      },
    });
    return;
  }

  console.error("Unhandled server error");

  response.status(500).json({
    error: {
      message: "Internal server error",
    },
  });
};
