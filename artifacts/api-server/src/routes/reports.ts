import { Router } from "express";
import { db } from "@workspace/db";
import { reportsTable } from "@workspace/db";
import { CreateReportBody } from "@workspace/api-zod";
import { desc } from "drizzle-orm";
import { createHash } from "crypto";
import { requireAdmin } from "../lib/admin-auth";

const router = Router();

function hashIp(ip: string): string {
  return createHash("sha256").update(ip + "nexusrandom_salt_2024").digest("hex");
}

function sanitizeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;")
    .replace(/\//g, "&#x2F;");
}

router.post("/reports", async (req, res): Promise<void> => {
  const body = CreateReportBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const ip = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.ip || "unknown";
  const reporterIpHash = hashIp(ip);

  const sanitizedDescription = body.data.description ? sanitizeHtml(body.data.description) : null;

  const [report] = await db
    .insert(reportsTable)
    .values({
      sessionId: body.data.sessionId,
      reporterIpHash,
      reason: body.data.reason,
      description: sanitizedDescription,
    })
    .returning();

  req.log.info({ reportId: report.id }, "Report created");
  res.status(201).json(report);
});

router.get("/reports", requireAdmin, async (_req, res): Promise<void> => {
  const reports = await db.select().from(reportsTable).orderBy(desc(reportsTable.createdAt)).limit(200);
  res.json(reports);
});

export default router;
