import { Client } from "@planetscale/database"
import { drizzle as drizzleMysql } from "drizzle-orm/mysql2"
import { drizzle as drizzlePlanetScale } from "drizzle-orm/planetscale-serverless"
import mysql from "mysql2/promise"
import { env } from "./env.js"
import { parseMySqlConnectionConfig } from "./mysql-config.js"
import * as schema from "./target-schema.js"

type TargetDbMode = "mysql" | "planetscale"

function resolveMode(): TargetDbMode {
  return env.target.mode
}

export function createTargetDb() {
  const mode = resolveMode()

  if (mode === "planetscale") {
    if (!env.target.planetscale) {
      throw new Error("Missing PlanetScale credentials")
    }

    const client = new Client({
      host: env.target.planetscale.host,
      username: env.target.planetscale.username,
      password: env.target.planetscale.password,
    })

    return {
      client,
      db: drizzlePlanetScale(client, { schema }),
    }
  }

  if (!env.target.databaseUrl) {
    throw new Error("TARGET_DATABASE_URL is required when TARGET_DB_MODE=mysql")
  }

  const client = mysql.createPool({
    ...parseMySqlConnectionConfig(env.target.databaseUrl),
    waitForConnections: true,
    connectionLimit: 10,
    maxIdle: 10,
    idleTimeout: 60_000,
    queueLimit: 0,
    enableKeepAlive: true,
    keepAliveInitialDelay: 0,
  })

  return {
    client,
    db: drizzleMysql(client, { schema, mode: "default" }),
  }
}
