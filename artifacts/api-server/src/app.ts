import express, { type Express } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import pinoHttp from "pino-http";
import rateLimit from "express-rate-limit";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

// Disable X-Powered-By header explicitly (also covered by Helmet)
app.disable("x-powered-by");

// Add security headers using Helmet with customized Content Security Policy
// to support WebRTC, Socket.io, and font loads.
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        connectSrc: ["'self'", "ws:", "wss:", "http:", "https:"], // WebRTC / Socket.io / API
        mediaSrc: ["'self'", "blob:", "data:"], // WebRTC stream rendering
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        imgSrc: ["'self'", "data:", "https:"],
        scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"], // Allowed for dev tools/bundling
        objectSrc: ["'none'"],
        upgradeInsecureRequests: [],
      },
    },
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" },
  })
);

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

app.set("trust proxy", 1);

// Disable unnecessary HTTP methods globally
app.use((req, res, next) => {
  const allowedMethods = ["GET", "POST", "DELETE", "OPTIONS"];
  if (!allowedMethods.includes(req.method)) {
    res.status(405).json({ error: `Method ${req.method} not allowed` });
    return;
  }
  next();
});

const allowedOrigin = process.env.ALLOWED_ORIGIN;
const origins = allowedOrigin ? allowedOrigin.split(",").map(o => o.trim()) : undefined;

app.use(
  cors(
    origins
      ? {
          origin: origins.length === 1 ? origins[0] : origins,
          methods: ["GET", "POST", "DELETE", "OPTIONS"],
          credentials: true,
        }
      : undefined,
  ),
);

// Cookie parser for reading secure auth cookies
app.use(cookieParser());

// Restrict payload sizes to 100kb to mitigate heap-exhaustion DoS attacks
app.use(express.json({ limit: "100kb" }));
app.use(express.urlencoded({ extended: true, limit: "100kb" }));

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please try again later." },
});

const reportLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many reports, please try again later." },
});

app.use("/api", apiLimiter);
app.use("/api/reports", reportLimiter);
app.use("/api", router);

// Centralized error handling middleware to prevent stack/internal leakage
app.use((err: any, req: any, res: any, next: any) => {
  req.log?.error({ err }, "Unhandled application error");
  const isProduction = process.env.NODE_ENV === "production";
  res.status(err.status || 500).json({
    error: isProduction ? "An unexpected error occurred" : err.message || "Internal Server Error",
  });
});

export default app;

