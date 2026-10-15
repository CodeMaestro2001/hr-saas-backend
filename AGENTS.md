# Agent Instructions — Workforce Management API

## Goal
Build a small, interview-ready **backend-focused** HR & Workforce Management application using Node.js, TypeScript, Express, PostgreSQL and Prisma. This is an independent practice project inspired by the general HR SaaS domain, not a reproduction of any employer's product.

## Working rules
- Build incrementally. Complete and verify one phase before starting the next.
- Prefer simple, readable code over complex architecture. Use a modular monolith; **no microservices**, Kafka, Kubernetes, or complex multi-tenancy.
- Use `npm`, Node.js LTS, TypeScript `strict` mode, Express, Prisma, PostgreSQL, Zod for validation, and Vitest + Supertest for tests.
- Use RESTful routes and a simple structure: routes -> controllers -> services -> Prisma.
- Handle errors centrally. Never leak passwords or secrets in responses/logs.
- Read secrets from `.env`; commit `.env.example` only. Do not commit `.env`.
- Use bcrypt to hash passwords and JWT Bearer tokens for authentication. Enforce authorization on the server, not just in the UI.
- Implement clear role permissions: ADMIN and EMPLOYEE. Ensure employees can only view/change their own permitted information.
- Use Prisma migrations and seed a demo admin and employee only for local development, with passwords from env or clearly documented local-only defaults.
- Avoid unnecessary dependencies and premature abstraction.
- After each phase, run typecheck, tests (when available), and build; report what passed, what failed, and exact next steps.
- Add short README commands and example requests for each new feature.
- Don't claim features or deployments are complete until verified.

## Core features (MVP)
1. Authentication: register/seed accounts, login, GET /api/auth/me.
2. Employees: ADMIN can create/list/view/update employee records; EMPLOYEE can view own record.
3. Leave requests: EMPLOYEE can create and view own requests; ADMIN can review all and approve/reject pending requests.
4. Attendance: EMPLOYEE check-in/check-out and view own history; ADMIN can view attendance history.
5. Robust input validation, pagination for list endpoints, and basic integration tests.

## Data design
- User: id, email (unique), passwordHash, role (ADMIN|EMPLOYEE), createdAt.
- Employee: id, userId (unique FK), fullName, department, jobTitle, createdAt.
- LeaveRequest: id, employeeId FK, startDate, endDate, reason, status (PENDING|APPROVED|REJECTED), reviewedAt nullable, createdAt.
- Attendance: id, employeeId FK, checkInAt, checkOutAt nullable.
- One employee has at most one open attendance session; enforce this in service logic and document possible concurrency concerns.
- Keep a single organization for MVP. Do **not** call it multi-tenant until tenant isolation is actually built.

## API outline
- POST /api/auth/login
- GET /api/auth/me
- GET /api/employees; POST /api/employees; GET /api/employees/:id; PATCH /api/employees/:id
- POST /api/leaves; GET /api/leaves; PATCH /api/leaves/:id/review
- POST /api/attendance/check-in; POST /api/attendance/check-out; GET /api/attendance
- GET /api/health

## Quality gates
- `npm run typecheck`, `npm run build`, `npm test` should pass before describing a phase as done.
- Tests should include successful login, failed login, unauthorized requests, role enforcement, invalid leave dates, approve/reject validation, and attendance check-in/check-out rules.
- Document migration and seed commands, environment variables, and example API usage in README.
