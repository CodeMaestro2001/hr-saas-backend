import type { RequestHandler, Response } from "express";
import type { ZodError } from "zod";

import * as leaveService from "../services/leave.service";
import {
  createLeaveSchema,
  leaveIdSchema,
  listLeavesSchema,
} from "../validation/leave.validation";

const sendValidationError = (response: Response, error: ZodError) => {
  response.status(400).json({
    error: {
      message: "Invalid request",
      fields: error.flatten().fieldErrors,
    },
  });
};

const parseId = (id: unknown, response: Response) => {
  const result = leaveIdSchema.safeParse(id);
  if (!result.success) {
    sendValidationError(response, result.error);
    return null;
  }
  return result.data;
};

export const createLeave: RequestHandler = async (request, response) => {
  const result = createLeaveSchema.safeParse(request.body);
  if (!result.success) {
    sendValidationError(response, result.error);
    return;
  }

  const leave = await leaveService.createLeave(request.user!.id, result.data);
  response.status(201).json({ leave });
};

export const listOwnLeaves: RequestHandler = async (request, response) => {
  const result = listLeavesSchema.safeParse(request.query);
  if (!result.success) {
    sendValidationError(response, result.error);
    return;
  }

  response.status(200).json(await leaveService.listOwnLeaves(request.user!.id, result.data));
};

export const listAllLeaves: RequestHandler = async (request, response) => {
  const result = listLeavesSchema.safeParse(request.query);
  if (!result.success) {
    sendValidationError(response, result.error);
    return;
  }

  response.status(200).json(await leaveService.listAllLeaves(result.data));
};

export const getLeave: RequestHandler = async (request, response) => {
  const id = parseId(request.params.id, response);
  if (!id) return;

  const leave = await leaveService.getLeave(id, request.user!);
  response.status(200).json({ leave });
};

export const approveLeave: RequestHandler = async (request, response) => {
  const id = parseId(request.params.id, response);
  if (!id) return;

  const leave = await leaveService.approveLeave(id, request.user!.id);
  response.status(200).json({ leave });
};

export const rejectLeave: RequestHandler = async (request, response) => {
  const id = parseId(request.params.id, response);
  if (!id) return;

  const leave = await leaveService.rejectLeave(id, request.user!.id);
  response.status(200).json({ leave });
};

export const cancelLeave: RequestHandler = async (request, response) => {
  const id = parseId(request.params.id, response);
  if (!id) return;

  const leave = await leaveService.cancelLeave(id, request.user!.id);
  response.status(200).json({ leave });
};
