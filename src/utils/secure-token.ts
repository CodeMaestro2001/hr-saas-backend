import { createHash, randomBytes } from "node:crypto";

export const createSecureToken = (bytes = 48) => randomBytes(bytes).toString("base64url");

export const hashSecureToken = (token: string) => {
  return createHash("sha256").update(token, "utf8").digest("hex");
};
