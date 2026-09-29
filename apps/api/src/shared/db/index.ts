import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema.js";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL!,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

export const db = drizzle(pool, { schema });

export type DB = typeof db;

/** A transaction handle (db.transaction callback argument). */
export type DbTx = Parameters<Parameters<DB['transaction']>[0]>[0];
/** Either the pool or an open transaction - for helpers that can join one. */
export type DbExecutor = DB | DbTx;
