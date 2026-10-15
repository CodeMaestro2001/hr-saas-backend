import "dotenv/config";

import bcrypt from "bcrypt";
import { PrismaClient, Role } from "@prisma/client";
import { z } from "zod";

const seedEnvSchema = z.object({
  SEED_ADMIN_EMAIL: z.string().email().default("admin@example.com"),
  SEED_ADMIN_PASSWORD: z.string().min(8),
  SEED_EMPLOYEE_EMAIL: z.string().email().default("employee@example.com"),
  SEED_EMPLOYEE_PASSWORD: z.string().min(8),
});

const seedEnv = seedEnvSchema.parse(process.env);
const prisma = new PrismaClient();
const HASH_ROUNDS = 12;

const seedUser = async (email: string, password: string, role: Role) => {
  const passwordHash = await bcrypt.hash(password, HASH_ROUNDS);

  await prisma.user.upsert({
    where: { email: email.toLowerCase() },
    update: { passwordHash, role },
    create: {
      email: email.toLowerCase(),
      passwordHash,
      role,
    },
  });
};

const main = async () => {
  await seedUser(seedEnv.SEED_ADMIN_EMAIL, seedEnv.SEED_ADMIN_PASSWORD, Role.ADMIN);
  await seedUser(seedEnv.SEED_EMPLOYEE_EMAIL, seedEnv.SEED_EMPLOYEE_PASSWORD, Role.EMPLOYEE);

  const employeeUser = await prisma.user.findUniqueOrThrow({
    where: { email: seedEnv.SEED_EMPLOYEE_EMAIL.toLowerCase() },
  });

  await prisma.employee.upsert({
    where: { userId: employeeUser.id },
    update: {
      fullName: "Demo Employee",
      department: "Engineering",
      jobTitle: "Software Engineer",
      isActive: true,
    },
    create: {
      userId: employeeUser.id,
      fullName: "Demo Employee",
      department: "Engineering",
      jobTitle: "Software Engineer",
      hireDate: new Date("2024-01-01"),
    },
  });

  console.log("Development admin and employee users seeded");
};

main()
  .catch(() => {
    console.error("Failed to seed development users");
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
