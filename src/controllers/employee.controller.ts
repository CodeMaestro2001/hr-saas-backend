import type { RequestHandler, Response } from "express";
import type { ZodError } from "zod";

import * as employeeService from "../services/employee.service";
import {
  createEmployeeSchema,
  employeeIdSchema,
  listEmployeesSchema,
  updateEmployeeSchema,
} from "../validation/employee.validation";

const sendValidationError = (response: Response, error: ZodError) => {
  response.status(400).json({
    error: {
      message: "Invalid request",
      fields: error.flatten().fieldErrors,
    },
  });
};

export const createEmployee: RequestHandler = async (request, response) => {
  const result = createEmployeeSchema.safeParse(request.body);
  if (!result.success) {
    sendValidationError(response, result.error);
    return;
  }

  const employee = await employeeService.createEmployee(result.data);
  response.status(201).json({ employee });
};

export const listEmployees: RequestHandler = async (request, response) => {
  const result = listEmployeesSchema.safeParse(request.query);
  if (!result.success) {
    sendValidationError(response, result.error);
    return;
  }

  response.status(200).json(await employeeService.listEmployees(result.data));
};

export const getOwnEmployee: RequestHandler = async (request, response) => {
  const employee = await employeeService.getEmployeeByUserId(request.user!.id);
  response.status(200).json({ employee });
};

export const getEmployee: RequestHandler = async (request, response) => {
  const result = employeeIdSchema.safeParse(request.params.id);
  if (!result.success) {
    sendValidationError(response, result.error);
    return;
  }

  const employee = await employeeService.getEmployeeById(result.data);
  response.status(200).json({ employee });
};

export const updateEmployee: RequestHandler = async (request, response) => {
  const idResult = employeeIdSchema.safeParse(request.params.id);
  const bodyResult = updateEmployeeSchema.safeParse(request.body);
  if (!idResult.success) {
    sendValidationError(response, idResult.error);
    return;
  }
  if (!bodyResult.success) {
    sendValidationError(response, bodyResult.error);
    return;
  }

  const employee = await employeeService.updateEmployee(idResult.data, bodyResult.data);
  response.status(200).json({ employee });
};

export const deactivateEmployee: RequestHandler = async (request, response) => {
  const result = employeeIdSchema.safeParse(request.params.id);
  if (!result.success) {
    sendValidationError(response, result.error);
    return;
  }

  const employee = await employeeService.deactivateEmployee(result.data);
  response.status(200).json({ employee });
};
