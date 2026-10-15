# Workforce Management API

A small backend-focused HR and workforce management API built with Node.js, TypeScript, Express, PostgreSQL, and Prisma.

Phase 5 provides the application foundation, JWT authentication, employee management, leave management, and attendance management. Payroll, advanced shifts, multi-tenancy, and frontend features are intentionally not implemented.

## Requirements

- Node.js 20 or newer
- npm
- PostgreSQL, either installed locally or run with Docker Compose

## Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy `.env.example` to `.env` and change credentials if needed:

   ```bash
   cp .env.example .env
   ```

   In PowerShell, use `Copy-Item .env.example .env`.

3. Start PostgreSQL with Docker Compose (or use a local PostgreSQL instance):

   ```bash
   docker compose up -d db
   ```

4. Apply the database migrations:

   ```bash
   npm run prisma:migrate
   ```

5. Seed the local development users:

   ```bash
   npm run prisma:seed
   ```

6. Start the API in development mode:

   ```bash
   npm run dev
   ```

The server listens on `http://localhost:3000` by default.

## Health endpoint

```bash
curl http://localhost:3000/api/health
```

Response:

```json
{ "status": "ok" }
```

## Authentication

The seed command creates or updates one admin and one employee using the email addresses and passwords in `.env`. Seed credentials are for local development only.

### Login

`POST /api/auth/login`

Postman request body (`Body` → `raw` → `JSON`):

```json
{
  "email": "admin@example.com",
  "password": "local-admin-password"
}
```

Example response:

```json
{
  "token": "<jwt>",
  "user": {
    "id": "<user-id>",
    "email": "admin@example.com",
    "role": "ADMIN"
  }
}
```

The token expires after one hour.

### Current user

`GET /api/auth/me`

In Postman, select `Authorization` → `Bearer Token` and paste the token returned by login. Alternatively, add this header:

```text
Authorization: Bearer <jwt>
```

Example response:

```json
{
  "user": {
    "id": "<user-id>",
    "email": "admin@example.com",
    "role": "ADMIN"
  }
}
```

## Employee management

All employee routes require a bearer token. Admins can create, list, view, update, and deactivate employee records. Employees use `/api/employees/me` to view only their own profile.

Created accounts are always assigned the `EMPLOYEE` role. Sending a `role` field is rejected. Deactivation is a soft update: the record remains in the database, while login and protected API access are blocked.

### Create an employee (ADMIN)

`POST /api/employees`

Postman JSON body:

```json
{
  "email": "new.employee@example.com",
  "password": "initial-password",
  "fullName": "Nimal Perera",
  "department": "Engineering",
  "jobTitle": "Backend Engineer",
  "hireDate": "2026-01-15"
}
```

The User account and Employee record are created atomically. Duplicate email addresses return `409 Conflict`.

### List and search employees (ADMIN)

```text
GET /api/employees?page=1&limit=20&search=engineering
```

`page` starts at `1`; `limit` must be between `1` and `100`. Search matches employee names, departments, job titles, and email addresses.

### View profiles

```text
GET /api/employees/me       # authenticated user's own profile
GET /api/employees/:id      # ADMIN only
```

### Update an employee (ADMIN)

`PATCH /api/employees/:id`

Postman JSON body; send one or more fields:

```json
{
  "department": "Platform Engineering",
  "jobTitle": "Senior Backend Engineer"
}
```

Allowed fields are `email`, `fullName`, `department`, `jobTitle`, and `hireDate`.

### Deactivate an employee (ADMIN)

```text
PATCH /api/employees/:id/deactivate
```

No request body is required. The employee record is retained with `isActive: false`.

### Employee endpoints

| Method | Path | Access |
| --- | --- | --- |
| `POST` | `/api/employees` | ADMIN |
| `GET` | `/api/employees` | ADMIN |
| `GET` | `/api/employees/me` | Authenticated user |
| `GET` | `/api/employees/:id` | ADMIN |
| `PATCH` | `/api/employees/:id` | ADMIN |
| `PATCH` | `/api/employees/:id/deactivate` | ADMIN |

## Leave management

Employees submit, view, and cancel their own leave requests. Admins view every request and approve or reject pending requests.

Dates use `YYYY-MM-DD` date-only values. Both boundary dates are inclusive, so a request starting on the end date of another pending or approved request is considered overlapping.

### Submit leave (EMPLOYEE)

`POST /api/leaves`

Postman JSON body:

```json
{
  "leaveType": "ANNUAL",
  "startDate": "2026-12-10",
  "endDate": "2026-12-12",
  "reason": "Year end break"
}
```

Allowed leave types are `ANNUAL`, `SICK`, and `CASUAL`. The employee identity comes from the authenticated user; an `employeeId` in the request body is rejected.

Overlaps with `PENDING` or `APPROVED` requests return `409 Conflict`. Rejected and cancelled requests do not block the same dates.

### List leave requests

```text
GET /api/leaves/me?page=1&limit=20                 # EMPLOYEE: own requests
GET /api/leaves?page=1&limit=20                    # ADMIN: all requests
GET /api/leaves?status=PENDING&leaveType=ANNUAL    # ADMIN: filtered list
GET /api/leaves/:id                                # ADMIN or owning employee
```

`limit` must be between `1` and `100`.

### Review leave (ADMIN)

```text
PATCH /api/leaves/:id/approve
PATCH /api/leaves/:id/reject
```

No request body is required. Only a `PENDING` request can be reviewed. The API records the reviewing admin and review time.

### Cancel leave (EMPLOYEE owner)

```text
PATCH /api/leaves/:id/cancel
```

No request body is required. Only the owner can cancel their own `PENDING` request.

### Leave endpoints

| Method | Path | Access |
| --- | --- | --- |
| `POST` | `/api/leaves` | EMPLOYEE |
| `GET` | `/api/leaves/me` | EMPLOYEE |
| `GET` | `/api/leaves` | ADMIN |
| `GET` | `/api/leaves/:id` | ADMIN or owner |
| `PATCH` | `/api/leaves/:id/approve` | ADMIN |
| `PATCH` | `/api/leaves/:id/reject` | ADMIN |
| `PATCH` | `/api/leaves/:id/cancel` | EMPLOYEE owner |

## Attendance management

Active employees check themselves in and out using server-generated UTC timestamps. Employees can view only their own attendance; admins can view all employees' records.

A PostgreSQL partial unique index guarantees that an employee can have at most one attendance row where `checkOutTime` is `NULL`, including during concurrent requests.

### Check in (EMPLOYEE)

```text
POST /api/attendance/check-in
```

In Postman, send the employee bearer token. No request body is required. A successful request returns `201 Created`. An existing open session returns `409 Conflict`.

### Check out (EMPLOYEE)

```text
POST /api/attendance/check-out
```

No request body is required. The server stores the checkout time and calculates complete elapsed minutes. Attendance can cross midnight; elapsed time is calculated from the UTC timestamps rather than calendar dates.

A checkout without an open session returns `409 Conflict`.

### Employee attendance history

```text
GET /api/attendance/me?page=1&limit=20
GET /api/attendance/today
```

`/today` uses UTC day boundaries and includes an open overnight session that overlaps the current UTC day.

### Admin attendance history

```text
GET /api/attendance?page=1&limit=20
GET /api/attendance/employee/:id?page=1&limit=20
```

The `:id` value is the Employee record ID. Pagination starts at page `1`, and `limit` must be between `1` and `100`.

### Attendance endpoints

| Method | Path | Access |
| --- | --- | --- |
| `POST` | `/api/attendance/check-in` | Active EMPLOYEE |
| `POST` | `/api/attendance/check-out` | Active EMPLOYEE |
| `GET` | `/api/attendance/me` | Active EMPLOYEE |
| `GET` | `/api/attendance/today` | Active EMPLOYEE |
| `GET` | `/api/attendance` | ADMIN |
| `GET` | `/api/attendance/employee/:id` | ADMIN |

## Commands

- `npm run dev` - run the API with file watching
- `npm run typecheck` - check TypeScript types
- `npm run build` - compile TypeScript to `dist`
- `npm start` - run the compiled API
- `npm test` - run tests once
- `npm run prisma:generate` - regenerate Prisma Client
- `npm run prisma:migrate -- --name <name>` - create and apply a development migration
- `npm run prisma:seed` - create or update the local demo admin and employee
- `npm run prisma:studio` - inspect database data in Prisma Studio

## Environment variables

- `PORT` - HTTP port; defaults to `3000`
- `DATABASE_URL` - PostgreSQL connection URL used by Prisma
- `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` - Docker Compose database settings
- `POSTGRES_PORT` - PostgreSQL host port used by Docker Compose; defaults to `5432`
- `JWT_SECRET` - private JWT signing secret containing at least 32 characters
- `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD` - local admin seed credentials
- `SEED_EMPLOYEE_EMAIL`, `SEED_EMPLOYEE_PASSWORD` - local employee seed credentials

The Node.js server runs directly on the host. Docker Compose starts only PostgreSQL.
If port `5432` is already in use, change both `POSTGRES_PORT` and the port in `DATABASE_URL` to another value such as `5433`.
