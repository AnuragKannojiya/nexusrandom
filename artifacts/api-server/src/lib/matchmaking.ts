import { Server as SocketIOServer, Socket } from "socket.io";
import { createHash, randomBytes } from "crypto";
import { db } from "@workspace/db";
import { sessionLogsTable } from "@workspace/db";
import { logger } from "./logger";

interface UserMeta {
  socketId: string;
  ipHash: string;
  joinedAt: number;
  interests: string[];
  region: string;
  recentPartners: Set<string>;
  skipCount: number;
  lastSkipAt: number;
}

interface ChatSession {
  sessionId: string;
  userA: { socketId: string; ipHash: string };
  userB: { socketId: string; ipHash: string };
  startedAt: number;
}

const waitingQueue: UserMeta[] = [];
const activeSessions = new Map<string, ChatSession>();
const socketToSession = new Map<string, string>();
const userMetaMap = new Map<string, UserMeta>();
let onlineCount = 0;
let totalChatsToday = 0;

function hashIp(ip: string): string {
  return createHash("sha256").update(ip + "nexusrandom_salt_2024").digest("hex");
}

function generateSessionId(): string {
  return randomBytes(16).toString("hex");
}

function generateStrangerName(): string {
  const adjectives = [
    "Cosmic", "Shadow", "Neon", "Silent", "Quantum", "Dark", "Electric",
    "Phantom", "Cyber", "Void", "Atomic", "Solar", "Lunar", "Hyper", "Ultra",
  ];
  const nouns = [
    "Wanderer", "Signal", "Echo", "Pulse", "Ghost", "Wave", "Storm",
    "Nexus", "Cipher", "Flux", "Seeker", "Drifter", "Specter", "Core", "Node",
  ];
  const num = Math.floor(Math.random() * 9000) + 1000;
  return `${adjectives[Math.floor(Math.random() * adjectives.length)]}${nouns[Math.floor(Math.random() * nouns.length)]}_${num}`;
}

function inferRegion(ip: string): string {
  if (ip === "unknown" || ip.startsWith("127.") || ip.startsWith("::1")) return "local";
  const first = parseInt(ip.split(".")[0], 10);
  if (first >= 1 && first <= 126) return "NA";
  if (first >= 128 && first <= 191) return "EU";
  if (first >= 192 && first <= 223) return "APAC";
  return "global";
}

function jaccardSimilarity(a: string[], b: string[]): number {
  if (a.length === 0 && b.length === 0) return 1;
  const setA = new Set(a);
  const setB = new Set(b);
  const intersection = [...setA].filter((x) => setB.has(x)).length;
  const union = new Set([...setA, ...setB]).size;
  return union === 0 ? 0 : intersection / union;
}

function waitTimeScore(joinedAt: number): number {
  const waitMs = Date.now() - joinedAt;
  return Math.min(waitMs / 30000, 1.0);
}

function geoScore(regionA: string, regionB: string): number {
  if (regionA === regionB) return 1.0;
  if (regionA === "global" || regionB === "global") return 0.5;
  return 0.0;
}

function matchScore(a: UserMeta, b: UserMeta): number {
  const interestSim = jaccardSimilarity(a.interests, b.interests);
  const geo = geoScore(a.region, b.region);
  const waitA = waitTimeScore(a.joinedAt);
  const waitB = waitTimeScore(b.joinedAt);
  const avgWait = (waitA + waitB) / 2;

  return (
    0.45 * interestSim +
    0.25 * geo +
    0.30 * avgWait
  );
}

function isRateLimited(meta: UserMeta): boolean {
  if (meta.skipCount < 5) return false;
  const timeSinceLastSkip = Date.now() - meta.lastSkipAt;
  return timeSinceLastSkip < 5000;
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
  if (idx !== -1) waitingQueue.splice(idx, 1);
}

function findBestMatch(candidate: UserMeta): number {
  let bestIdx = -1;
  let bestScore = -1;

  for (let i = 0; i < waitingQueue.length; i++) {
    const other = waitingQueue[i];
    if (other.socketId === candidate.socketId) continue;
    if (candidate.recentPartners.has(other.socketId)) continue;
    if (other.recentPartners.has(candidate.socketId)) continue;

    const score = matchScore(candidate, other);
    if (score > bestScore) {
      bestScore = score;
      bestIdx = i;
    }
  }

  return bestIdx;
}

function tryMatch(io: SocketIOServer): void {
  const processed = new Set<string>();

  for (let i = 0; i < waitingQueue.length; i++) {
    const userA = waitingQueue[i];
    if (processed.has(userA.socketId)) continue;

    const socketA = io.sockets.sockets.get(userA.socketId);
    if (!socketA) {
      waitingQueue.splice(i, 1);
      i--;
      continue;
    }

    const bestIdx = findBestMatch(userA);
    if (bestIdx === -1) continue;

    const userB = waitingQueue[bestIdx];
    const socketB = io.sockets.sockets.get(userB.socketId);
    if (!socketB) {
      waitingQueue.splice(bestIdx, 1);
      i = Math.max(i - 1, -1);
      continue;
    }

    waitingQueue.splice(Math.max(i, bestIdx), 1);
    waitingQueue.splice(Math.min(i, bestIdx), 1);
    processed.add(userA.socketId);
    processed.add(userB.socketId);
    i = -1;

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

    userA.recentPartners.add(userB.socketId);
    userB.recentPartners.add(userA.socketId);
    if (userA.recentPartners.size > 20) {
      const first = userA.recentPartners.values().next().value;
      if (first) userA.recentPartners.delete(first);
    }
    if (userB.recentPartners.size > 20) {
      const first = userB.recentPartners.values().next().value;
      if (first) userB.recentPartners.delete(first);
    }

    socketA.join(sessionId);
    socketB.join(sessionId);

    socketA.emit("matched", {
      sessionId,
      strangerName: generateStrangerName(),
      startWebRTC: true,
    });
    socketB.emit("matched", {
      sessionId,
      strangerName: generateStrangerName(),
      startWebRTC: false,
    });

    logSessionEvent(sessionId, "matched", userA.ipHash, userB.ipHash);
    logger.info({ sessionId }, "Users matched");
  }
}

function endSession(io: SocketIOServer, sessionId: string, disconnectingSocketId?: string): void {
  const session = activeSessions.get(sessionId);
  if (!session) return;

  const otherSocketId =
    session.userA.socketId === disconnectingSocketId
      ? session.userB.socketId
      : session.userA.socketId;

  const otherSocket = io.sockets.sockets.get(otherSocketId);
  if (otherSocket) {
    otherSocket.emit("strangerLeft");
    otherSocket.leave(sessionId);
  }

  const disconnectingSocket = disconnectingSocketId
    ? io.sockets.sockets.get(disconnectingSocketId)
    : undefined;
  if (disconnectingSocket) disconnectingSocket.leave(sessionId);

  socketToSession.delete(session.userA.socketId);
  socketToSession.delete(session.userB.socketId);
  activeSessions.delete(sessionId);

  logSessionEvent(sessionId, "ended", session.userA.ipHash, session.userB.ipHash);
}

export function setupSocketIO(io: SocketIOServer): void {
  io.on("connection", (socket: Socket) => {
    const rawIp =
      (socket.handshake.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
      socket.handshake.address ||
      "unknown";

    const ipHash = hashIp(rawIp);
    const region = inferRegion(rawIp);

    const meta: UserMeta = {
      socketId: socket.id,
      ipHash,
      joinedAt: Date.now(),
      interests: [],
      region,
      recentPartners: new Set(),
      skipCount: 0,
      lastSkipAt: 0,
    };
    userMetaMap.set(socket.id, meta);

    onlineCount++;
    broadcastOnlineCount(io);
    logger.info({ socketId: socket.id }, "User connected");

    socket.on("joinQueue", (data?: { interests?: string[] }) => {
      const existingSession = socketToSession.get(socket.id);
      if (existingSession) endSession(io, existingSession, socket.id);

      removeFromQueue(socket.id);

      const interests = (data?.interests ?? [])
        .filter((i: unknown) => typeof i === "string")
        .slice(0, 10)
        .map((i: string) => i.toLowerCase().trim());

      meta.interests = interests;
      meta.joinedAt = Date.now();
      waitingQueue.push(meta);
      socket.emit("queued", { position: waitingQueue.length });
      tryMatch(io);
    });

    socket.on("leaveQueue", () => {
      removeFromQueue(socket.id);
      const sessionId = socketToSession.get(socket.id);
      if (sessionId) endSession(io, sessionId, socket.id);
    });

    socket.on("skip", (data?: { interests?: string[] }) => {
      if (isRateLimited(meta)) {
        socket.emit("skipRateLimited", { waitMs: 5000 });
        return;
      }

      meta.skipCount++;
      meta.lastSkipAt = Date.now();

      if (data?.interests) {
        meta.interests = (data.interests)
          .filter((i: unknown) => typeof i === "string")
          .slice(0, 10)
          .map((i: string) => i.toLowerCase().trim());
      }

      const sessionId = socketToSession.get(socket.id);
      if (sessionId) endSession(io, sessionId, socket.id);

      removeFromQueue(socket.id);
      meta.joinedAt = Date.now();
      waitingQueue.push(meta);
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

      const otherSocketId =
        session.userA.socketId === socket.id ? session.userB.socketId : session.userA.socketId;
      const otherSocket = io.sockets.sockets.get(otherSocketId);

      socket.emit("chatMessage", { text, from: "you" });
      if (otherSocket) otherSocket.emit("chatMessage", { text, from: "stranger" });
    });

    socket.on("typing", () => {
      const sessionId = socketToSession.get(socket.id);
      if (!sessionId) return;
      const session = activeSessions.get(sessionId);
      if (!session) return;

      const otherSocketId =
        session.userA.socketId === socket.id ? session.userB.socketId : session.userA.socketId;
      io.sockets.sockets.get(otherSocketId)?.emit("strangerTyping");
    });

    socket.on("webrtcOffer", (data: { offer: any }) => {
      const sessionId = socketToSession.get(socket.id);
      if (!sessionId || !data?.offer) return;
      const session = activeSessions.get(sessionId);
      if (!session) return;

      const otherSocketId =
        session.userA.socketId === socket.id ? session.userB.socketId : session.userA.socketId;
      io.sockets.sockets.get(otherSocketId)?.emit("webrtcOffer", { offer: data.offer });
    });

    socket.on("webrtcAnswer", (data: { answer: any }) => {
      const sessionId = socketToSession.get(socket.id);
      if (!sessionId || !data?.answer) return;
      const session = activeSessions.get(sessionId);
      if (!session) return;

      const otherSocketId =
        session.userA.socketId === socket.id ? session.userB.socketId : session.userA.socketId;
      io.sockets.sockets.get(otherSocketId)?.emit("webrtcAnswer", { answer: data.answer });
    });

    socket.on("webrtcIceCandidate", (data: { candidate: any }) => {
      const sessionId = socketToSession.get(socket.id);
      if (!sessionId || !data?.candidate) return;
      const session = activeSessions.get(sessionId);
      if (!session) return;

      const otherSocketId =
        session.userA.socketId === socket.id ? session.userB.socketId : session.userA.socketId;
      io.sockets.sockets.get(otherSocketId)?.emit("webrtcIceCandidate", { candidate: data.candidate });
    });

    socket.on("disconnect", () => {
      onlineCount = Math.max(0, onlineCount - 1);
      broadcastOnlineCount(io);
      removeFromQueue(socket.id);

      const sessionId = socketToSession.get(socket.id);
      if (sessionId) endSession(io, sessionId, socket.id);

      userMetaMap.delete(socket.id);
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
