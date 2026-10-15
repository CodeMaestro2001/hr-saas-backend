-- CreateEnum
CREATE TYPE "LeaveType" AS ENUM ('ANNUAL', 'SICK', 'CASUAL');

-- AlterEnum
ALTER TYPE "LeaveStatus" ADD VALUE 'CANCELLED';

-- DropIndex
DROP INDEX "LeaveRequest_employeeId_idx";

-- AlterTable
ALTER TABLE "LeaveRequest" ADD COLUMN     "leaveType" "LeaveType" NOT NULL DEFAULT 'CASUAL',
ADD COLUMN     "reviewedById" UUID,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateIndex
CREATE INDEX "LeaveRequest_employeeId_status_startDate_endDate_idx" ON "LeaveRequest"("employeeId", "status", "startDate", "endDate");

-- CreateIndex
CREATE INDEX "LeaveRequest_reviewedById_idx" ON "LeaveRequest"("reviewedById");

-- AddForeignKey
ALTER TABLE "LeaveRequest" ADD CONSTRAINT "LeaveRequest_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
