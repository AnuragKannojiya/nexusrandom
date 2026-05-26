import { createServer } from "http";
import { Server as SocketIOServer } from "socket.io";
import app from "./app";
import { logger } from "./lib/logger";
import { setupSocketIO } from "./lib/matchmaking";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const httpServer = createServer(app);

const allowedOrigin = process.env.ALLOWED_ORIGIN;
const origins = allowedOrigin ? allowedOrigin.split(",").map(o => o.trim()) : undefined;

const io = new SocketIOServer(httpServer, {
  cors: origins
    ? {
        origin: origins.length === 1 ? origins[0] : origins,
        methods: ["GET", "POST"],
        credentials: true,
      }
    : { origin: "*", methods: ["GET", "POST"] },
  transports: ["websocket", "polling"],
});

setupSocketIO(io);

httpServer.listen(port, (err?: Error) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening with Socket.io");
});
