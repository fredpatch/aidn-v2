import "dotenv/config";
import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import morgan from "morgan";

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

app.listen(port, () => {
  console.log(`AIDN API listening on port ${port}`);
});
