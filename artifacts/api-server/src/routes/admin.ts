import { Router } from "express";
import { createAdminToken, verifyAdminPassword } from "../lib/admin-auth";

const router = Router();

const loginLimiter = (async () => {
  const { default: rateLimit } = await import("express-rate-limit");
  return rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many login attempts. Try again in 15 minutes." },
    skipSuccessfulRequests: false,
  });
})();

router.post("/admin/login", async (req, res): Promise<void> => {
  const limiter = await loginLimiter;
  limiter(req, res, async () => {
    const { password } = req.body ?? {};
    if (typeof password !== "string" || !password) {
      res.status(400).json({ error: "Password required" });
      return;
    }

    await new Promise((r) => setTimeout(r, 200 + Math.random() * 100));

    if (!verifyAdminPassword(password)) {
      req.log?.warn({ ip: req.ip }, "Failed admin login attempt");
      res.status(401).json({ error: "Invalid password" });
      return;
    }

    const token = createAdminToken();
    req.log?.info({ ip: req.ip }, "Admin login successful");
    res.json({ token });
  });
});

export default router;
