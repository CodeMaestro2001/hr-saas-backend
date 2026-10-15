-- Rename existing columns so attendance history is preserved.
ALTER TABLE "Attendance" RENAME COLUMN "checkInAt" TO "checkInTime";
ALTER TABLE "Attendance" RENAME COLUMN "checkOutAt" TO "checkOutTime";

-- Existing timestamp values were written by the API as UTC. Convert them to
-- timezone-aware PostgreSQL timestamps while preserving those UTC instants.
ALTER TABLE "Attendance"
ALTER COLUMN "checkInTime" TYPE TIMESTAMPTZ(3)
USING "checkInTime" AT TIME ZONE 'UTC';

ALTER TABLE "Attendance"
ALTER COLUMN "checkOutTime" TYPE TIMESTAMPTZ(3)
USING "checkOutTime" AT TIME ZONE 'UTC';

ALTER TABLE "Attendance"
ADD COLUMN "workedMinutes" INTEGER,
ADD COLUMN "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD CONSTRAINT "Attendance_workedMinutes_nonnegative"
CHECK ("workedMinutes" IS NULL OR "workedMinutes" >= 0);

DROP INDEX "Attendance_employeeId_idx";

CREATE INDEX "Attendance_employeeId_checkInTime_idx"
ON "Attendance"("employeeId", "checkInTime");

-- Prisma cannot express a partial unique index in schema.prisma. This database
-- constraint is the final guard against concurrent duplicate check-ins.
CREATE UNIQUE INDEX "Attendance_one_open_session_per_employee"
ON "Attendance"("employeeId")
WHERE "checkOutTime" IS NULL;
