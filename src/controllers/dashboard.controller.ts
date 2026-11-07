import type { RequestHandler } from "express";

import * as dashboardService from "../services/dashboard.service";

export const getAdminDashboard: RequestHandler = async (_request, response) => {
  response.status(200).json({ summary: await dashboardService.getAdminSummary() });
};

export const getEmployeeDashboard: RequestHandler = async (request, response) => {
  response.status(200).json({
    summary: await dashboardService.getEmployeeSummary(request.user!.id),
  });
};
