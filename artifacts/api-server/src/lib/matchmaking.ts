import { Server as SocketIOServer, Socket } from "socket.io";
import { createHash, randomBytes } from "crypto";
import { db } from "@workspace/db";
import { reportsTable, sessionLogsTable } from "@workspace/db";
import { logger } from "./logger";

interface QueueEntry {
  socketId: string;
  ipHash: string;
  joinedAt: number;
}

interface ChatSession {
  sessionId: string;
  userA: { socketId: string; ipHash: string };
  userB: { socketId: string; ipHash: string };
  startedAt: number;
}

const waitingQueue: QueueEntry[] = [];
const activeSessions = new Map<string, ChatSession>();
const socketToSession = new Map<string, string>();
let onlineCount = 0;
const onlineSocketIds = new Set<string>();
let totalChatsToday = 0;

function hashIp(ip: string): string {
  return createHash("sha256").update(ip + "nexusrandom_salt_2024").digest("hex");
}

function generateSessionId(): string {
  return randomBytes(16).toString("hex");
}

function generateStrangerName(): string {
  const adjectives = ["Cosmic", "Shadow", "Neon", "Silent", "Quantum", "Dark", "Electric", "Phantom", "Cyber", "Void"];
  const nouns = ["Wanderer", "Signal", "Echo", "Pulse", "Ghost", "Wave", "Storm", "Nexus", "Cipher", "Flux"];
  const num = Math.floor(Math.random() * 9000) + 1000;
  return `${adjectives[Math.floor(Math.random() * adjectives.length)]}${nouns[Math.floor(Math.random() * nouns.length)]}_${num}`;
}

async function logSessionEvent(
  sessionId: string,
  event: string,
  ipHashA?: string,
  ipHashB?: string,
  metadata?: string,
): Promise<void> {
  try {
    await db.insert(sessionLogsTable).values({ sessionId, event, ipHashA, ipHashB, metadata });
  } catch (err) {
    logger.error({ err }, "Failed to log session event");
  }
}

function broadcastOnlineCount(io: SocketIOServer): void {
  io.emit("onlineCount", onlineCount);
}

function removeFromQueue(socketId: string): void {
  const idx = waitingQueue.findIndex((e) => e.socketId === socketId);
  if (idx !== -1) {
    waitingQueue.splice(idx, 1);
  }
}

function tryMatch(io: SocketIOServer): void {
  while (waitingQueue.length >= 2) {
    const userA = waitingQueue.shift()!;
    const userB = waitingQueue.shift()!;

    const socketA = io.sockets.sockets.get(userA.socketId);
    const socketB = io.sockets.sockets.get(userB.socketId);

    if (!socketA || !socketB) {
      if (socketA) waitingQueue.unshift(userA);
      if (socketB) waitingQueue.unshift(userB);
      continue;
    }

    const sessionId = generateSessionId();
    const session: ChatSession = {
      sessionId,
      userA: { socketId: userA.socketId, ipHash: userA.ipHash },
      userB: { socketId: userB.socketId, ipHash: userB.ipHash },
      startedAt: Date.now(),
    };

    activeSessions.set(sessionId, session);
    socketToSession.set(userA.socketId, sessionId);
    socketToSession.set(userB.socketId, sessionId);
    totalChatsToday++;

    const strangerNameA = generateStrangerName();
    const strangerNameB = generateStrangerName();

    socketA.join(sessionId);
    socketB.join(sessionId);

    socketA.emit("matched", { sessionId, strangerName: strangerNameB, startWebRTC: true });
    socketB.emit("matched", { sessionId, strangerName: strangerNameA, startWebRTC: false });

    logSessionEvent(sessionId, "matched", userA.ipHash, userB.ipHash);
    logger.info({ sessionId }, "Users matched");
  }
}

function endSession(io: SocketIOServer, sessionId: string, disconnectingSocketId?: string): void {
  const session = activeSessions.get(sessionId);
  if (!session) return;

  const otherSocketId =
    session.userA.socketId === disconnectingSocketId ? session.userB.socketId : session.userA.socketId;

  const otherSocket = io.sockets.sockets.get(otherSocketId);
  if (otherSocket) {
    otherSocket.emit("strangerLeft");
    otherSocket.leave(sessionId);
  }

  const disconnectingSocket = disconnectingSocketId ? io.sockets.sockets.get(disconnectingSocketId) : undefined;
  if (disconnectingSocket) {
    disconnectingSocket.leave(sessionId);
  }

  socketToSession.delete(session.userA.socketId);
  socketToSession.delete(session.userB.socketId);
  activeSessions.delete(sessionId);

  logSessionEvent(sessionId, "ended", session.userA.ipHash, session.userB.ipHash);
}

export function setupSocketIO(io: SocketIOServer): void {
  io.on("connection", (socket: Socket) => {
    const ip = (socket.handshake.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || socket.handshake.address || "unknown";
    const ipHash = hashIp(ip);

    onlineCount++;
    onlineSocketIds.add(socket.id);
    broadcastOnlineCount(io);
    logger.info({ socketId: socket.id }, "User connected");

    socket.on("joinQueue", () => {
      const existingSessionId = socketToSession.get(socket.id);
      if (existingSessionId) {
        endSession(io, existingSessionId, socket.id);
      }

      removeFromQueue(socket.id);
      waitingQueue.push({ socketId: socket.id, ipHash, joinedAt: Date.now() });
      socket.emit("queued", { position: waitingQueue.length });
      tryMatch(io);
    });

    socket.on("leaveQueue", () => {
      removeFromQueue(socket.id);
      const sessionId = socketToSession.get(socket.id);
      if (sessionId) {
        endSession(io, sessionId, socket.id);
      }
    });

    socket.on("skip", () => {
      const sessionId = socketToSession.get(socket.id);
      if (sessionId) {
        endSession(io, sessionId, socket.id);
      }
      removeFromQueue(socket.id);
      waitingQueue.push({ socketId: socket.id, ipHash, joinedAt: Date.now() });
      socket.emit("queued", { position: waitingQueue.length });
      tryMatch(io);
    });

    socket.on("chatMessage", (data: { text: string }) => {
      const sessionId = socketToSession.get(socket.id);
      if (!sessionId) return;

      const session = activeSessions.get(sessionId);
      if (!session) return;

      const text = String(data?.text || "").slice(0, 2000);
      if (!text.trim()) return;

      const otherSocketId = session.userA.socketId === socket.id ? session.userB.socketId : session.userA.socketId;
      const otherSocket = io.sockets.sockets.get(otherSocketId);

      socket.emit("chatMessage", { text, from: "you" });
      if (otherSocket) {
        otherSocket.emit("chatMessage", { text, from: "stranger" });
      }
    });

    socket.on("typing", () => {
      const sessionId = socketToSession.get(socket.id);
      if (!sessionId) return;

      const session = activeSessions.get(sessionId);
      if (!session) return;

      const otherSocketId = session.userA.socketId === socket.id ? session.userB.socketId : session.userA.socketId;
      const otherSocket = io.sockets.sockets.get(otherSocketId);
      if (otherSocket) {
        otherSocket.emit("strangerTyping");
      }
    });

    socket.on("webrtcOffer", (data: { offer: RTCSessionDescriptionInit }) => {
      const sessionId = socketToSession.get(socket.id);
      if (!sessionId) return;

      const session = activeSessions.get(sessionId);
      if (!session) return;

      const otherSocketId = session.userA.socketId === socket.id ? session.userB.socketId : session.userA.socketId;
      const otherSocket = io.sockets.sockets.get(otherSocketId);
      if (otherSocket) {
        otherSocket.emit("webrtcOffer", { offer: data.offer });
      }
    });

    socket.on("webrtcAnswer", (data: { answer: RTCSessionDescriptionInit }) => {
      const sessionId = socketToSession.get(socket.id);
      if (!sessionId) return;

      const session = activeSessions.get(sessionId);
      if (!session) return;

      const otherSocketId = session.userA.socketId === socket.id ? session.userB.socketId : session.userA.socketId;
      const otherSocket = io.sockets.sockets.get(otherSocketId);
      if (otherSocket) {
        otherSocket.emit("webrtcAnswer", { answer: data.answer });
      }
    });

    socket.on("webrtcIceCandidate", (data: { candidate: RTCIceCandidateInit }) => {
      const sessionId = socketToSession.get(socket.id);
      if (!sessionId) return;

      const session = activeSessions.get(sessionId);
      if (!session) return;

      const otherSocketId = session.userA.socketId === socket.id ? session.userB.socketId : session.userA.socketId;
      const otherSocket = io.sockets.sockets.get(otherSocketId);
      if (otherSocket) {
        otherSocket.emit("webrtcIceCandidate", { candidate: data.candidate });
      }
    });

    socket.on("disconnect", () => {
      onlineCount = Math.max(0, onlineCount - 1);
      onlineSocketIds.delete(socket.id);
      broadcastOnlineCount(io);

      removeFromQueue(socket.id);

      const sessionId = socketToSession.get(socket.id);
      if (sessionId) {
        endSession(io, sessionId, socket.id);
      }

      logger.info({ socketId: socket.id }, "User disconnected");
    });
  });
}

export function getStats() {
  return {
    onlineUsers: onlineCount,
    activeChats: activeSessions.size,
    totalChatsToday,
  };
}
