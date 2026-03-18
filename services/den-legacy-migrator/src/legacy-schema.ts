import { sql } from "drizzle-orm"
import {
  boolean,
  index,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core"

const id = () => varchar("id", { length: 64 }).notNull()

const timestamps = {
  created_at: timestamp("created_at", { fsp: 3 }).notNull().defaultNow(),
  updated_at: timestamp("updated_at", { fsp: 3 })
    .notNull()
    .default(sql`CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)`),
}

export const OrgRole = ["owner", "member"] as const
export const WorkerDestination = ["local", "cloud"] as const
export const WorkerStatus = ["provisioning", "healthy", "failed", "stopped"] as const
export const TokenScope = ["client", "host"] as const

export const LegacyUserTable = mysqlTable(
  "user",
  {
    id: varchar("id", { length: 36 }).notNull().primaryKey(),
    name: varchar("name", { length: 255 }).notNull(),
    email: varchar("email", { length: 255 }).notNull(),
    emailVerified: boolean("email_verified").notNull().default(false),
    image: text("image"),
    createdAt: timestamp("created_at", { fsp: 3 }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { fsp: 3 })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)`),
  },
  (table) => [uniqueIndex("user_email").on(table.email)],
)

export const LegacySessionTable = mysqlTable(
  "session",
  {
    id: varchar("id", { length: 36 }).notNull().primaryKey(),
    userId: varchar("user_id", { length: 36 }).notNull(),
    token: varchar("token", { length: 255 }).notNull(),
    expiresAt: timestamp("expires_at", { fsp: 3 }).notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { fsp: 3 }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { fsp: 3 })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)`),
  },
  (table) => [
    uniqueIndex("session_token").on(table.token),
    index("session_user_id").on(table.userId),
  ],
)

export const LegacyAccountTable = mysqlTable(
  "account",
  {
    id: varchar("id", { length: 36 }).notNull().primaryKey(),
    userId: varchar("user_id", { length: 36 }).notNull(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", { fsp: 3 }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { fsp: 3 }),
    scope: text("scope"),
    idToken: text("id_token"),
    password: text("password"),
    createdAt: timestamp("created_at", { fsp: 3 }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { fsp: 3 })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)`),
  },
  (table) => [index("account_user_id").on(table.userId)],
)

export const LegacyAdminAllowlistTable = mysqlTable(
  "admin_allowlist",
  {
    id: id().primaryKey(),
    email: varchar("email", { length: 255 }).notNull(),
    note: varchar("note", { length: 255 }),
    ...timestamps,
  },
  (table) => [uniqueIndex("admin_allowlist_email").on(table.email)],
)

export const LegacyOrgTable = mysqlTable(
  "org",
  {
    id: id().primaryKey(),
    name: varchar("name", { length: 255 }).notNull(),
    slug: varchar("slug", { length: 255 }).notNull(),
    owner_user_id: varchar("owner_user_id", { length: 64 }).notNull(),
    ...timestamps,
  },
  (table) => [uniqueIndex("org_slug").on(table.slug), index("org_owner_user_id").on(table.owner_user_id)],
)

export const LegacyOrgMembershipTable = mysqlTable(
  "org_membership",
  {
    id: id().primaryKey(),
    org_id: varchar("org_id", { length: 64 }).notNull(),
    user_id: varchar("user_id", { length: 64 }).notNull(),
    role: mysqlEnum("role", OrgRole).notNull(),
    created_at: timestamp("created_at", { fsp: 3 }).notNull().defaultNow(),
  },
  (table) => [index("org_membership_org_id").on(table.org_id), index("org_membership_user_id").on(table.user_id)],
)

export const LegacyWorkerTable = mysqlTable(
  "worker",
  {
    id: id().primaryKey(),
    org_id: varchar("org_id", { length: 64 }).notNull(),
    created_by_user_id: varchar("created_by_user_id", { length: 64 }),
    name: varchar("name", { length: 255 }).notNull(),
    description: varchar("description", { length: 1024 }),
    destination: mysqlEnum("destination", WorkerDestination).notNull(),
    status: mysqlEnum("status", WorkerStatus).notNull(),
    image_version: varchar("image_version", { length: 128 }),
    workspace_path: varchar("workspace_path", { length: 1024 }),
    sandbox_backend: varchar("sandbox_backend", { length: 64 }),
    ...timestamps,
  },
  (table) => [
    index("worker_org_id").on(table.org_id),
    index("worker_created_by_user_id").on(table.created_by_user_id),
    index("worker_status").on(table.status),
  ],
)

export const LegacyWorkerInstanceTable = mysqlTable(
  "worker_instance",
  {
    id: id().primaryKey(),
    worker_id: varchar("worker_id", { length: 64 }).notNull(),
    provider: varchar("provider", { length: 64 }).notNull(),
    region: varchar("region", { length: 64 }),
    url: varchar("url", { length: 2048 }).notNull(),
    status: mysqlEnum("status", WorkerStatus).notNull(),
    ...timestamps,
  },
  (table) => [index("worker_instance_worker_id").on(table.worker_id)],
)

export const LegacyWorkerTokenTable = mysqlTable(
  "worker_token",
  {
    id: id().primaryKey(),
    worker_id: varchar("worker_id", { length: 64 }).notNull(),
    scope: mysqlEnum("scope", TokenScope).notNull(),
    token: varchar("token", { length: 128 }).notNull(),
    created_at: timestamp("created_at", { fsp: 3 }).notNull().defaultNow(),
    revoked_at: timestamp("revoked_at", { fsp: 3 }),
  },
  (table) => [
    index("worker_token_worker_id").on(table.worker_id),
    uniqueIndex("worker_token_token").on(table.token),
  ],
)

export const LegacyWorkerBundleTable = mysqlTable(
  "worker_bundle",
  {
    id: id().primaryKey(),
    worker_id: varchar("worker_id", { length: 64 }).notNull(),
    storage_url: varchar("storage_url", { length: 2048 }).notNull(),
    status: varchar("status", { length: 64 }).notNull(),
    created_at: timestamp("created_at", { fsp: 3 }).notNull().defaultNow(),
  },
  (table) => [index("worker_bundle_worker_id").on(table.worker_id)],
)
