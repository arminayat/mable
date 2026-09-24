import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

const globalPool = globalThis as typeof globalThis & { mablePool?: Pool };
const pool = globalPool.mablePool ?? new Pool({ connectionString: process.env.DATABASE_URL });
if (process.env.NODE_ENV !== "production") globalPool.mablePool = pool;
export const db = drizzle(pool, { schema });
export { pool };
