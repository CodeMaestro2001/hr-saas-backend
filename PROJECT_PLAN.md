# Workforce Management API — Project Plan

## What we are building
A small backend HR application using **Node.js + TypeScript + Express + PostgreSQL + Prisma**. Main modules: login, employees, leave requests, and attendance. Target: easy to understand, easy to demo, relevant for an Associate Backend Software Engineer interview.

## Stack
- Node.js LTS + TypeScript
- Express.js
- PostgreSQL + Prisma ORM
- Zod validation
- bcrypt + JWT authentication
- Vitest + Supertest tests
- Git/GitHub
- Docker Compose for **database only** (optional if local PostgreSQL available)
- GitHub Actions CI after the core app works

## Phase 1 — Foundation (do now)
1. Initialize Node/TypeScript application and npm scripts (`dev`, `typecheck`, `build`, `start`, `test`).
2. Set up a maintainable `src` structure with Express app and server entrypoint.
3. Implement `GET /api/health` returning `{ "status": "ok" }`.
4. Configure environment variables, `.env.example`, `.gitignore`, and error handling.
5. Add Prisma + PostgreSQL connection and initial schema: User, Employee, LeaveRequest, Attendance.
6. Provide docker-compose.yml for PostgreSQL only; do not require Docker for the Node server.
7. Write a concise README for setup, migrations and running the API.
8. Add a basic health endpoint test. Run typecheck/build/tests and fix failures.

**Stop at the end of Phase 1**, summarize files created, tests run, and ask before Phase 2.

## Phase 2 — Authentication
- Seed demo users, password hashing, login JWT endpoint, auth middleware, `GET /api/auth/me`, tests.

## Phase 3 — Employees
- ADMIN can create/list/get/update employees; EMPLOYEE can view own profile; validations and tests.

## Phase 4 — Leave management
- Create leave requests, employee-owned lists, admin review (approve/reject), validation and tests.

## Phase 5 — Attendance
- Check-in/check-out, prevent duplicate check-ins, list history, admin visibility, tests.

## Phase 6 — Polish and interview readiness
- GitHub Actions: install, typecheck, test, build; optional Swagger API docs; clearer README with curl/Postman examples; deploy only if time permits.
- No frontend required initially. Optional small React frontend later, only after the backend is working.

## First prompt to paste into Codex
Read AGENTS.md and PROJECT_PLAN.md. Implement **Phase 1 only** for this Node.js + TypeScript + Express backend. Keep it simple, use PostgreSQL + Prisma, and add docker-compose.yml for the database only. Run available checks, explain setup commands, and STOP after Phase 1. Don't implement authentication or other phases yet.
