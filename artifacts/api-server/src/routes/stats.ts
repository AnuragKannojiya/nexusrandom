import { Router } from "express";
import { getStats } from "../lib/matchmaking";

const router = Router();

router.get("/stats", (_req, res) => {
  const stats = getStats();
  res.json(stats);
});

export default router;
