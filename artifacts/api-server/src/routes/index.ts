import { Router, type IRouter } from "express";
import healthRouter from "./health";
import gameStatsRouter from "./game-stats";

const router: IRouter = Router();

router.use(healthRouter);
router.use(gameStatsRouter);

export default router;
