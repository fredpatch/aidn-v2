import "dotenv/config";
import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import morgan from "morgan";

import bootstrapRoute from "./modules/bootstrap/bootstrap.route.js";
import authRoute from "./modules/auth/auth.route.js";
import usersRoute from "./modules/users/users.route.js";
import requestsRoute from "./modules/requests/requests.route.js";
import { startDgCircuitAlertJob } from "./jobs/dg-circuit-alert.job.js";
import { verifyEmailConnection } from "./shared/utils/email.js";

const app = express();
const port = process.env.PORT ? Number(process.env.PORT) : 4000;

app.use(helmet());
app.use(cors({ origin: process.env.CORS_ORIGIN?.split(",") ?? true, credentials: true }));
app.use(cookieParser());
app.use(express.json());
app.use(morgan("dev"));

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

// Module routes are mounted here as each sprint lands.
// See docs/TASKS.md for the sprint order and technical/conventions.md
// for module codes (M1, M3-M13).
app.use("/api/bootstrap", bootstrapRoute);
app.use("/api/auth", authRoute);
app.use("/api/users", usersRoute);
app.use("/api/requests", requestsRoute);

app.listen(port, () => {
  console.log(`AIDN API listening on port ${port}`);
  startDgCircuitAlertJob();
  verifyEmailConnection().catch(() => {
    // Non-fatal - already logged inside verifyEmailConnection.
  });
});
