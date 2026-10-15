import express from "express";

import { errorHandler, notFoundHandler } from "./middleware/error-handler";
import { attendanceRouter } from "./routes/attendance.routes";
import { authRouter } from "./routes/auth.routes";
import { employeeRouter } from "./routes/employee.routes";
import { healthRouter } from "./routes/health.routes";
import { leaveRouter } from "./routes/leave.routes";

export const createApp = () => {
  const app = express();

  app.disable("x-powered-by");
  app.use(express.json());

  app.use("/api/health", healthRouter);
  app.use("/api/auth", authRouter);
  app.use("/api/employees", employeeRouter);
  app.use("/api/leaves", leaveRouter);
  app.use("/api/attendance", attendanceRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
};
