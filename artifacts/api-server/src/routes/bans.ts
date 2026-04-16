import { Router } from "express";
import { db } from "@workspace/db";
import { bansTable } from "@workspace/db";
import { CreateBanBody } from "@workspace/api-zod";
import { desc, eq, and, or, isNull, gt } from "drizzle-orm";
import { createHash } from "crypto";

const router = Router();

function hashIp(ip: string): string {
  return createHash("sha256").update(ip + "nexusrandom_salt_2024").digest("hex");
}

router.get("/bans", async (_req, res): Promise<void> => {
  const bans = await db.select().from(bansTable).orderBy(desc(bansTable.createdAt)).limit(100);
  res.json(bans);
});

router.post("/bans", async (req, res): Promise<void> => {
  const body = CreateBanBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const [ban] = await db
    .insert(bansTable)
    .values({
      ipHash: body.data.ipHash,
      reason: body.data.reason,
      expiresAt: body.data.expiresAt ?? null,
    })
    .returning();

  req.log.info({ banId: ban.id }, "Ban created");
  res.status(201).json(ban);
});

router.get("/bans/check", async (req, res): Promise<void> => {
  const ip = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.ip || "unknown";
  const ipHash = hashIp(ip);

  const now = new Date();
  const activeBan = await db
    .select()
    .from(bansTable)
    .where(
      and(
        eq(bansTable.ipHash, ipHash),
        or(isNull(bansTable.expiresAt), gt(bansTable.expiresAt, now)),
      ),
    )
    .limit(1);

  if (activeBan.length > 0) {
    res.json({ banned: true, reason: activeBan[0].reason, expiresAt: activeBan[0].expiresAt });
    return;
  }

  res.json({ banned: false, reason: null, expiresAt: null });
});

export default router;
