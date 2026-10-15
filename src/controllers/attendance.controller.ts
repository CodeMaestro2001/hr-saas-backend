import type { RequestHandler, Response } from "express";
import type { ZodError } from "zod";

import * as attendanceService from "../services/attendance.service";
import {
  attendanceListSchema,
  employeeIdSchema,
} from "../validation/attendance.validation";

const sendValidationError = (response: Response, error: ZodError) => {
  response.status(400).json({
    error: {
      message: "Invalid request",
      fields: error.flatten().fieldErrors,
    },
  });
};

export const checkIn: RequestHandler = async (request, response) => {
  const attendance = await attendanceService.checkIn(request.user!.id);
  response.status(201).json({ attendance });
};

export const checkOut: RequestHandler = async (request, response) => {
  const attendance = await attendanceService.checkOut(request.user!.id);
  response.status(200).json({ attendance });
};

export const listOwnAttendance: RequestHandler = async (request, response) => {
  const result = attendanceListSchema.safeParse(request.query);
  if (!result.success) {
    sendValidationError(response, result.error);
    return;
  }

  response.status(200).json(
    await attendanceService.listOwnAttendance(request.user!.id, result.data),
  );
};

export const listTodayAttendance: RequestHandler = async (request, response) => {
  response.status(200).json(
    await attendanceService.listTodayAttendance(request.user!.id),
  );
};

export const listAllAttendance: RequestHandler = async (request, response) => {
  const result = attendanceListSchema.safeParse(request.query);
  if (!result.success) {
    sendValidationError(response, result.error);
    return;
  }

  response.status(200).json(await attendanceService.listAllAttendance(result.data));
};

export const listEmployeeAttendance: RequestHandler = async (request, response) => {
  const idResult = employeeIdSchema.safeParse(request.params.id);
  const queryResult = attendanceListSchema.safeParse(request.query);
  if (!idResult.success) {
    sendValidationError(response, idResult.error);
    return;
  }
  if (!queryResult.success) {
    sendValidationError(response, queryResult.error);
    return;
  }

  response.status(200).json(
    await attendanceService.listEmployeeAttendance(idResult.data, queryResult.data),
  );
};
