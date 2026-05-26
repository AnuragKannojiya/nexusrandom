import { createHmac, timingSafeEqual } from "crypto";
import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";

const ADMIN_SECRET = process.env.ADMIN_SECRET ?? "";
const SESSION_SECRET = process.env.SESSION_SECRET ?? ADMIN_SECRET;
const JWT_SECRET = SESSION_SECRET || "fallback-security-jwt-secret-key-1324";

const ACCESS_TOKEN_EXPIRY = "15m";
const REFRESH_TOKEN_EXPIRY = "7d";
const ACCESS_COOKIE_MAX_AGE_MS = 15 * 60 * 1000;
const REFRESH_COOKIE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

if (!ADMIN_SECRET) {
  console.warn("[admin-auth] WARNING: ADMIN_SECRET is not set. Moderation endpoints are disabled.");
}

// Check password strength and warn for weak configuration
if (ADMIN_SECRET && !ADMIN_SECRET.startsWith("$2a$") && !ADMIN_SECRET.startsWith("$2b$")) {
  if (ADMIN_SECRET.length < 8) {
    console.warn("[admin-auth] WARNING: ADMIN_SECRET is too short (< 8 characters). Enforce a stronger password.");
  }
}

export interface AdminJwtPayload {
  role: string;
  refresh?: boolean;
}

/**
 * Creates a standard Access JWT token (expires in 15 mins)
 */
export function createAdminAccessToken(): string {
  return jwt.sign({ role: "admin" }, JWT_SECRET, { expiresIn: ACCESS_TOKEN_EXPIRY });
}

/**
 * Creates a standard Refresh JWT token (expires in 7 days)
 */
export function createAdminRefreshToken(): string {
  return jwt.sign({ role: "admin", refresh: true }, JWT_SECRET, { expiresIn: REFRESH_TOKEN_EXPIRY });
}

/**
 * Verifies a token and returns the payload if valid.
 */
export function verifyAdminToken(token: string, isRefresh = false): AdminJwtPayload | null {
  try {
    const payload = jwt.verify(token, JWT_SECRET) as AdminJwtPayload;
    if (isRefresh && !payload.refresh) return null;
    if (!isRefresh && payload.refresh) return null;
    return payload;
  } catch {
    return null;
  }
}

/**
 * Verifies the admin password using bcrypt (if hashed) or timingSafeEqual (if plain text).
 */
export function verifyAdminPassword(password: string): boolean {
  if (!ADMIN_SECRET) return false;

  // If the secret is stored as a bcrypt hash, verify using bcrypt.
  if (ADMIN_SECRET.startsWith("$2a$") || ADMIN_SECRET.startsWith("$2b$")) {
    try {
      return bcrypt.compareSync(password, ADMIN_SECRET);
    } catch (err) {
      console.error("[admin-auth] Bcrypt verification error", err);
      return false;
    }
  }

  // Otherwise fallback to secure timingSafeEqual plain text comparison
  const inputBuf = Buffer.from(password);
  const secretBuf = Buffer.from(ADMIN_SECRET);
  if (inputBuf.length !== secretBuf.length) {
    timingSafeEqual(secretBuf, secretBuf);
    return false;
  }
  return timingSafeEqual(inputBuf, secretBuf);
}

/**
 * Decodes a base32 string to a Buffer (lightweight, zero dependency)
 */
function base32Decode(base32: string): Buffer {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const cleaned = base32.toUpperCase().replace(/=+$/, "");
  let length = cleaned.length;
  let bits = 0;
  let value = 0;
  let index = 0;
  const buffer = Buffer.alloc(Math.ceil((length * 5) / 8));

  for (let i = 0; i < length; i++) {
    const val = alphabet.indexOf(cleaned[i]);
    if (val === -1) throw new Error("Invalid base32 character");
    value = (value << 5) | val;
    bits += 5;
    if (bits >= 8) {
      buffer[index++] = (value >>> (bits - 8)) & 255;
      bits -= 8;
    }
  }
  return buffer.subarray(0, index);
}

/**
 * Verifies a 6-digit TOTP token against a base32 secret (RFC 6238 compliant)
 */
export function verifyTOTP(token: string, secret: string, window = 1): boolean {
  try {
    const key = base32Decode(secret);
    const epoch = Math.floor(Date.now() / 1000);
    const counter = Math.floor(epoch / 30);

    for (let i = -window; i <= window; i++) {
      const currentCounter = counter + i;
      const counterBuffer = Buffer.alloc(8);
      
      let tmp = currentCounter;
      for (let j = 7; j >= 0; j--) {
        counterBuffer[j] = tmp & 0xff;
        tmp = tmp >> 8;
      }

      const hmac = createHmac("sha1", key).update(counterBuffer).digest();
      const offset = hmac[hmac.length - 1] & 0xf;
      const code =
        ((hmac[offset] & 0x7f) << 24) |
        ((hmac[offset + 1] & 0xff) << 16) |
        ((hmac[offset + 2] & 0xff) << 8) |
        (hmac[offset + 3] & 0xff);

      const otp = (code % 1_000_000).toString().padStart(6, "0");
      if (otp === token) return true;
    }
    return false;
  } catch (err) {
    console.error("[admin-auth] TOTP verification error", err);
    return false;
  }
}

/**
 * Returns whether 2FA is active based on the presence of the environment variable.
 */
export function is2faEnabled(): boolean {
  return typeof process.env.ADMIN_2FA_SECRET === "string" && process.env.ADMIN_2FA_SECRET.trim().length > 0;
}

/**
 * Express middleware requiring admin privileges, supporting JWT in cookies or authorization headers.
 * Implements sliding sessions by automatically checking and renewing access tokens using the refresh token.
 */
export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!ADMIN_SECRET) {
    res.status(503).json({ error: "Admin access not configured. Set ADMIN_SECRET environment variable." });
    return;
  }

  // 1. Check for access token in cookies
  let accessToken = req.cookies?.admin_access_token;
  let isFromCookie = true;

  // 2. Fallback to Authorization Header
  const authHeader = req.headers["authorization"];
  if (!accessToken && authHeader?.startsWith("Bearer ")) {
    accessToken = authHeader.slice(7);
    isFromCookie = false;
  }

  if (accessToken) {
    const payload = verifyAdminToken(accessToken, false);
    if (payload) {
      (req as any).admin = payload;
      return next();
    }
  }

  // 3. Slide Session: If access token is missing or expired, check the refresh token in cookies
  const refreshToken = req.cookies?.admin_refresh_token;
  if (refreshToken) {
    const refreshPayload = verifyAdminToken(refreshToken, true);
    if (refreshPayload) {
      // Renew access token
      const newAccessToken = createAdminAccessToken();
      
      // Update cookie
      const isProduction = process.env.NODE_ENV === "production";
      res.cookie("admin_access_token", newAccessToken, {
        httpOnly: true,
        secure: isProduction,
        sameSite: "lax",
        maxAge: ACCESS_COOKIE_MAX_AGE_MS,
      });

      (req as any).admin = { role: "admin" };
      return next();
    }
  }

  // Clear invalid cookies if authentication failed
  if (req.cookies?.admin_access_token || req.cookies?.admin_refresh_token) {
    res.clearCookie("admin_access_token");
    res.clearCookie("admin_refresh_token");
  }

  res.status(401).json({ error: "Unauthorized access: Invalid or expired session" });
}
