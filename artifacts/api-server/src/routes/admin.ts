import { Router } from "express";
import {
  createAdminAccessToken,
  createAdminRefreshToken,
  verifyAdminPassword,
  is2faEnabled,
  verifyTOTP,
} from "../lib/admin-auth";

const router = Router();

const loginLimiter = (async () => {
  const { default: rateLimit } = await import("express-rate-limit");
  return rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5, // Hardened to 5 attempts per 15 minutes
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many login attempts. Try again in 15 minutes." },
    skipSuccessfulRequests: false,
  });
})();

router.post("/admin/login", async (req, res): Promise<void> => {
  const limiter = await loginLimiter;
  limiter(req, res, async () => {
    const { password, totp } = req.body ?? {};
    if (typeof password !== "string" || !password) {
      res.status(400).json({ error: "Password required" });
      return;
    }

    // Mitigation for timing analysis attacks
    await new Promise((r) => setTimeout(r, 200 + Math.random() * 100));

    // 1. Verify primary password
    if (!verifyAdminPassword(password)) {
      req.log?.warn({ ip: req.ip }, "Failed admin login attempt (invalid password)");
      res.status(401).json({ error: "Invalid password" });
      return;
    }

    // 2. Optional 2FA validation
    if (is2faEnabled()) {
      const otpSecret = process.env.ADMIN_2FA_SECRET!;
      if (typeof totp !== "string" || !totp) {
        req.log?.info({ ip: req.ip }, "Admin login: 2FA prompt required");
        res.status(400).json({ error: "2FA code required", twoFactorRequired: true });
        return;
      }

      if (!verifyTOTP(totp, otpSecret)) {
        req.log?.warn({ ip: req.ip }, "Failed admin login attempt (invalid 2FA code)");
        res.status(401).json({ error: "Invalid 2FA code" });
        return;
      }
    }

    // 3. Issue JWT Access & Refresh Tokens
    const accessToken = createAdminAccessToken();
    const refreshToken = createAdminRefreshToken();

    const isProduction = process.env.NODE_ENV === "production";

    // Set secure HTTP-only cookies
    res.cookie("admin_access_token", accessToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: "lax",
      maxAge: 15 * 60 * 1000, // 15 minutes
    });

    res.cookie("admin_refresh_token", refreshToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    req.log?.info({ ip: req.ip }, "Admin login successful");
    res.json({ token: accessToken });
  });
});

router.post("/admin/logout", (req, res) => {
  res.clearCookie("admin_access_token");
  res.clearCookie("admin_refresh_token");
  req.log?.info({ ip: req.ip }, "Admin logged out successfully");
  res.json({ success: true });
});

export default router;

