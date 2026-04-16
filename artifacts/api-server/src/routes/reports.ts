import { Router } from "express";
import { db } from "@workspace/db";
import { reportsTable } from "@workspace/db";
import { CreateReportBody } from "@workspace/api-zod";
import { desc } from "drizzle-orm";
import { createHash } from "crypto";

const router = Router();

function hashIp(ip: string): string {
  return createHash("sha256").update(ip + "nexusrandom_salt_2024").digest("hex");
}

router.post("/reports", async (req, res): Promise<void> => {
  const body = CreateReportBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const ip = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.ip || "unknown";
  const reporterIpHash = hashIp(ip);

  const [report] = await db
    .insert(reportsTable)
    .values({
      sessionId: body.data.sessionId,
      reporterIpHash,
      reason: body.data.reason,
      description: body.data.description ?? null,
    })
    .returning();

  req.log.info({ reportId: report.id }, "Report created");
  res.status(201).json(report);
});

router.get("/reports", async (req, res): Promise<void> => {
  const reports = await db.select().from(reportsTable).orderBy(desc(reportsTable.createdAt)).limit(100);
  res.json(reports);
});

export default router;
