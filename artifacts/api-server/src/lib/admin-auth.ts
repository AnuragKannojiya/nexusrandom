import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import type { Request, Response, NextFunction } from "express";

const ADMIN_SECRET = process.env.ADMIN_SECRET ?? "";
const TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

if (!ADMIN_SECRET) {
  console.warn("[admin-auth] WARNING: ADMIN_SECRET is not set. Moderation endpoints are disabled.");
}

export function createAdminToken(): string {
  const timestamp = Date.now().toString();
  const nonce = randomBytes(8).toString("hex");
  const payload = `${timestamp}.${nonce}`;
  const sig = createHmac("sha256", ADMIN_SECRET).update(payload).digest("hex");
  return Buffer.from(`${payload}.${sig}`).toString("base64url");
}

export function verifyAdminToken(token: string): boolean {
  if (!ADMIN_SECRET) return false;
  try {
    const decoded = Buffer.from(token, "base64url").toString();
    const lastDot = decoded.lastIndexOf(".");
    if (lastDot === -1) return false;
    const payload = decoded.slice(0, lastDot);
    const sig = decoded.slice(lastDot + 1);
    const expectedSig = createHmac("sha256", ADMIN_SECRET).update(payload).digest("hex");

    const sigBuf = Buffer.from(sig, "hex");
    const expectedBuf = Buffer.from(expectedSig, "hex");
    if (sigBuf.length !== expectedBuf.length) return false;
    if (!timingSafeEqual(sigBuf, expectedBuf)) return false;

    const dotIdx = payload.indexOf(".");
    const timestamp = parseInt(payload.slice(0, dotIdx), 10);
    if (isNaN(timestamp)) return false;
    if (Date.now() - timestamp > TOKEN_TTL_MS) return false;

    return true;
  } catch {
    return false;
  }
}

export function verifyAdminPassword(password: string): boolean {
  if (!ADMIN_SECRET) return false;
  const inputBuf = Buffer.from(password);
  const secretBuf = Buffer.from(ADMIN_SECRET);
  if (inputBuf.length !== secretBuf.length) {
    timingSafeEqual(secretBuf, secretBuf);
    return false;
  }
  return timingSafeEqual(inputBuf, secretBuf);
}

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!ADMIN_SECRET) {
    res.status(503).json({ error: "Admin access not configured. Set ADMIN_SECRET environment variable." });
    return;
  }

  const authHeader = req.headers["authorization"];
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const token = authHeader.slice(7);
  if (!verifyAdminToken(token)) {
    res.status(401).json({ error: "Invalid or expired token" });
    return;
  }

  next();
}
