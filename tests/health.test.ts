import request from "supertest";
import { describe, expect, it } from "vitest";

import { createApp } from "../src/app";
import { env } from "../src/config/env";

describe("GET /api/health", () => {
  it("returns a successful health response", async () => {
    const response = await request(createApp()).get("/api/health");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: "ok" });
  });

  it("allows requests from the configured frontend origin", async () => {
    const response = await request(createApp())
      .get("/api/health")
      .set("Origin", env.CORS_ORIGIN);

    expect(response.status).toBe(200);
    expect(response.headers["access-control-allow-origin"]).toBe(env.CORS_ORIGIN);
  });

  it("does not add CORS headers for an unconfigured origin", async () => {
    const response = await request(createApp())
      .get("/api/health")
      .set("Origin", "https://untrusted.example");

    expect(response.status).toBe(200);
    expect(response.headers["access-control-allow-origin"]).toBeUndefined();
  });
});
