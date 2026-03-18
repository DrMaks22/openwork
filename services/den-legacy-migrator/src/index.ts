import "./load-env.js"
import path from "node:path"
import { timingSafeEqual } from "node:crypto"
import { fileURLToPath } from "node:url"
import express from "express"
import { z } from "zod"
import { env } from "./env.js"
import {
  LEGACY_DELETE_CONFIRMATION,
  listLegacyUsers,
  previewMigration,
  retireLegacyUsers,
  runMigration,
  stopLegacyRenderWorkers,
} from "./migrate.js"

const app = express()
const currentFile = fileURLToPath(import.meta.url)
const publicDir = path.resolve(path.dirname(currentFile), "../public")

function equalStrings(left: string, right: string) {
  const leftBuffer = Buffer.from(left)
  const rightBuffer = Buffer.from(right)

  if (leftBuffer.length !== rightBuffer.length) {
    return false
  }

  return timingSafeEqual(new Uint8Array(leftBuffer), new Uint8Array(rightBuffer))
}

function requireBasicAuth(req: express.Request, res: express.Response, next: express.NextFunction) {
  if (req.path === "/health") {
    next()
    return
  }

  const header = req.headers.authorization
  if (!header?.startsWith("Basic ")) {
    res.setHeader("WWW-Authenticate", 'Basic realm="Den Legacy Migrator"')
    res.status(401).send("Authentication required")
    return
  }

  const decoded = Buffer.from(header.slice(6), "base64").toString("utf8")
  const separatorIndex = decoded.indexOf(":")
  const username = separatorIndex >= 0 ? decoded.slice(0, separatorIndex) : decoded
  const password = separatorIndex >= 0 ? decoded.slice(separatorIndex + 1) : ""

  if (!equalStrings(username, env.auth.username) || !equalStrings(password, env.auth.password)) {
    res.setHeader("WWW-Authenticate", 'Basic realm="Den Legacy Migrator"')
    res.status(401).send("Invalid credentials")
    return
  }

  next()
}

function asyncRoute(handler: (req: express.Request, res: express.Response) => Promise<void>) {
  return (req: express.Request, res: express.Response, next: express.NextFunction) => {
    handler(req, res).catch(next)
  }
}

const selectionSchema = z.object({
  legacyUserIds: z.array(z.string().min(1)).min(1),
})

const cleanupSchema = selectionSchema.extend({
  confirmation: z.string().min(1),
})

app.disable("x-powered-by")
app.use(express.json({ limit: "1mb" }))
app.use(requireBasicAuth)
app.use(express.static(publicDir, { extensions: ["html"] }))

app.get("/health", (_, res) => {
  res.json({ ok: true })
})

app.get("/api/users", asyncRoute(async (req, res) => {
  const query = typeof req.query.q === "string" ? req.query.q : ""
  const users = await listLegacyUsers(query)
  res.json({
    query,
    users,
    generatedAt: new Date().toISOString(),
  })
}))

app.post("/api/plan", asyncRoute(async (req, res) => {
  const { legacyUserIds } = selectionSchema.parse(req.body)
  const preview = await previewMigration(legacyUserIds)
  res.json({
    ...preview,
    generatedAt: new Date().toISOString(),
  })
}))

app.post("/api/migrate", asyncRoute(async (req, res) => {
  const { legacyUserIds } = selectionSchema.parse(req.body)
  const result = await runMigration(legacyUserIds)
  res.json({
    ...result,
    generatedAt: new Date().toISOString(),
  })
}))

app.post("/api/stop-workers", asyncRoute(async (req, res) => {
  const { legacyUserIds } = selectionSchema.parse(req.body)
  const result = await stopLegacyRenderWorkers(legacyUserIds)
  res.json({
    ...result,
    generatedAt: new Date().toISOString(),
  })
}))

app.post("/api/cleanup", asyncRoute(async (req, res) => {
  const { legacyUserIds, confirmation } = cleanupSchema.parse(req.body)
  const result = await retireLegacyUsers(legacyUserIds, confirmation)
  res.json({
    ...result,
    expectedConfirmation: LEGACY_DELETE_CONFIRMATION,
    generatedAt: new Date().toISOString(),
  })
}))

app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const message = error instanceof Error ? error.message : "unknown_error"
  res.status(400).json({ error: message })
})

app.listen(env.port, () => {
  console.log(`den legacy migrator listening on ${env.port}`)
})
