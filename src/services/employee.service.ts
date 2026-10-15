import bcrypt from "bcrypt";
import { Prisma, Role } from "@prisma/client";

import { prisma } from "../lib/prisma";
import type {
  CreateEmployeeInput,
  ListEmployeesInput,
  UpdateEmployeeInput,
} from "../validation/employee.validation";
import { AppError } from "../utils/app-error";

const HASH_ROUNDS = 12;

const employeeSelect = {
  id: true,
  userId: true,
  fullName: true,
  department: true,
  jobTitle: true,
  hireDate: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
  user: {
    select: {
      email: true,
    },
  },
} satisfies Prisma.EmployeeSelect;

type SelectedEmployee = Prisma.EmployeeGetPayload<{ select: typeof employeeSelect }>;

const toEmployeeResponse = (employee: SelectedEmployee) => ({
  id: employee.id,
  userId: employee.userId,
  email: employee.user.email,
  fullName: employee.fullName,
  department: employee.department,
  jobTitle: employee.jobTitle,
  hireDate: employee.hireDate,
  isActive: employee.isActive,
  createdAt: employee.createdAt,
  updatedAt: employee.updatedAt,
});

const handleUniqueEmail = (error: unknown): never => {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
    throw new AppError(409, "Email already in use");
  }

  throw error;
};

export const createEmployee = async (input: CreateEmployeeInput) => {
  const passwordHash = await bcrypt.hash(input.password, HASH_ROUNDS);

  try {
    const user = await prisma.user.create({
      data: {
        email: input.email,
        passwordHash,
        role: Role.EMPLOYEE,
        employee: {
          create: {
            fullName: input.fullName,
            department: input.department,
            jobTitle: input.jobTitle,
            hireDate: input.hireDate,
          },
        },
      },
      select: {
        id: true,
        email: true,
        employee: {
          select: {
            id: true,
            fullName: true,
            department: true,
            jobTitle: true,
            hireDate: true,
            isActive: true,
            createdAt: true,
            updatedAt: true,
          },
        },
      },
    });

    if (!user.employee) {
      throw new Error("Employee nested create did not return a profile");
    }

    return {
      userId: user.id,
      email: user.email,
      ...user.employee,
    };
  } catch (error) {
    handleUniqueEmail(error);
  }
};

export const listEmployees = async ({ page, limit, search }: ListEmployeesInput) => {
  const where: Prisma.EmployeeWhereInput = search
    ? {
        OR: [
          { fullName: { contains: search, mode: "insensitive" } },
          { department: { contains: search, mode: "insensitive" } },
          { jobTitle: { contains: search, mode: "insensitive" } },
          { user: { email: { contains: search, mode: "insensitive" } } },
        ],
      }
    : {};

  const [employees, total] = await prisma.$transaction([
    prisma.employee.findMany({
      where,
      select: employeeSelect,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.employee.count({ where }),
  ]);

  return {
    data: employees.map(toEmployeeResponse),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
};

export const getEmployeeById = async (id: string) => {
  const employee = await prisma.employee.findUnique({
    where: { id },
    select: employeeSelect,
  });

  if (!employee) {
    throw new AppError(404, "Employee not found");
  }

  return toEmployeeResponse(employee);
};

export const getEmployeeByUserId = async (userId: string) => {
  const employee = await prisma.employee.findUnique({
    where: { userId },
    select: employeeSelect,
  });

  if (!employee) {
    throw new AppError(404, "Employee profile not found");
  }

  return toEmployeeResponse(employee);
};

export const updateEmployee = async (id: string, input: UpdateEmployeeInput) => {
  try {
    const employee = await prisma.employee.update({
      where: { id },
      data: {
        fullName: input.fullName,
        department: input.department,
        jobTitle: input.jobTitle,
        hireDate: input.hireDate,
        user: input.email
          ? {
              update: { email: input.email },
            }
          : undefined,
      },
      select: employeeSelect,
    });

    return toEmployeeResponse(employee);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      throw new AppError(404, "Employee not found");
    }

    handleUniqueEmail(error);
  }
};

export const deactivateEmployee = async (id: string) => {
  try {
    const employee = await prisma.employee.update({
      where: { id },
      data: { isActive: false },
      select: employeeSelect,
    });

    return toEmployeeResponse(employee);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      throw new AppError(404, "Employee not found");
    }

    throw error;
  }
};
