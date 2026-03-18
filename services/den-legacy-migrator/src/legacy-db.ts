import { drizzle } from "drizzle-orm/mysql2"
import mysql from "mysql2/promise"
import { env } from "./env.js"
import * as schema from "./legacy-schema.js"
import { parseMySqlConnectionConfig } from "./mysql-config.js"

export const legacyClient = mysql.createPool({
  ...parseMySqlConnectionConfig(env.legacyDatabaseUrl),
  waitForConnections: true,
  connectionLimit: 10,
  maxIdle: 10,
  idleTimeout: 60_000,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0,
})

export const legacyDb = drizzle(legacyClient, { schema, mode: "default" })
