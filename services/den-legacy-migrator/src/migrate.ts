import { createHash } from "node:crypto"
import { TypeID } from "typeid-js"
import {
  AdminAllowlistTable,
  AuthAccountTable,
  AuthUserTable,
  OrgMembershipTable,
  OrgTable,
  WorkerBundleTable,
  WorkerInstanceTable,
  WorkerTable,
  WorkerTokenTable,
} from "./target-schema.js"
import { desc, inArray, like, or, sql } from "drizzle-orm"
import { createTargetDb } from "./target-db.js"
import { env } from "./env.js"
import { legacyDb } from "./legacy-db.js"
import {
  LegacyAccountTable,
  LegacyAdminAllowlistTable,
  LegacyOrgMembershipTable,
  LegacyOrgTable,
  LegacySessionTable,
  LegacyUserTable,
  LegacyWorkerBundleTable,
  LegacyWorkerInstanceTable,
  LegacyWorkerTable,
  LegacyWorkerTokenTable,
} from "./legacy-schema.js"

const denTypeIdPrefixes = {
  user: "usr",
  account: "acc",
  org: "org",
  orgMembership: "om",
  adminAllowlist: "aal",
  worker: "wrk",
  workerInstance: "wki",
  workerToken: "wkt",
  workerBundle: "wkb",
} as const

type DenTypeIdName = keyof typeof denTypeIdPrefixes
type DenTypeId<TName extends DenTypeIdName> = `${(typeof denTypeIdPrefixes)[TName]}_${string}`

const target = createTargetDb()

const targetDb = target.db

type LegacyUser = typeof LegacyUserTable.$inferSelect
type LegacyAccount = typeof LegacyAccountTable.$inferSelect
type LegacyOrg = typeof LegacyOrgTable.$inferSelect
type LegacyOrgMembership = typeof LegacyOrgMembershipTable.$inferSelect
type LegacyWorker = typeof LegacyWorkerTable.$inferSelect
type LegacyWorkerInstance = typeof LegacyWorkerInstanceTable.$inferSelect
type LegacyWorkerToken = typeof LegacyWorkerTokenTable.$inferSelect
type LegacyWorkerBundle = typeof LegacyWorkerBundleTable.$inferSelect
type LegacyAdminAllowlist = typeof LegacyAdminAllowlistTable.$inferSelect

type UserStatus = "pending" | "migrated" | "conflict"

type ListedLegacyUser = {
  id: string
  name: string
  email: string
  createdAt: Date | string
  updatedAt: Date | string
  lastSeenAt: Date | string | null
  accountCount: number
  orgCount: number
  workerCount: number
  status: UserStatus
  mappedTargetUserId: string
  conflictReason: string | null
}

type MigrationPlan = {
  requestedLegacyUserIds: string[]
  rootUsers: LegacyUser[]
  includedUsers: LegacyUser[]
  includedAccounts: LegacyAccount[]
  includedOrgs: LegacyOrg[]
  includedMemberships: LegacyOrgMembership[]
  includedWorkers: LegacyWorker[]
  includedWorkerInstances: LegacyWorkerInstance[]
  includedWorkerTokens: LegacyWorkerToken[]
  includedWorkerBundles: LegacyWorkerBundle[]
  includedAdminAllowlist: LegacyAdminAllowlist[]
  autoIncludedUsers: LegacyUser[]
  conflicts: string[]
  warnings: string[]
}

type MigrationSummary = {
  rootUsers: number
  totalUsers: number
  autoIncludedUsers: number
  accounts: number
  orgs: number
  memberships: number
  workers: number
  workerInstances: number
  workerTokens: number
  workerBundles: number
  adminAllowlistRows: number
}

function unique<T>(values: T[]) {
  return Array.from(new Set(values))
}

function chunk<T>(values: T[], size = 100) {
  const chunks: T[][] = []
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size))
  }
  return chunks
}

function formatUuid(bytes: Uint8Array) {
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join("-")
}

function legacyUuidSeed(name: string, legacyId: string) {
  const digest = createHash("sha1").update(`den-legacy:${name}:${legacyId}`).digest()
  const bytes = Uint8Array.from(digest.subarray(0, 16))
  bytes[6] = (bytes[6] & 0x0f) | 0x50
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  return formatUuid(bytes)
}

function mapLegacyId<TName extends DenTypeIdName>(name: TName, legacyId: string): DenTypeId<TName> {
  return TypeID.fromUUID(denTypeIdPrefixes[name], legacyUuidSeed(name, legacyId)).toString() as DenTypeId<TName>
}

function toNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value
  }

  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

async function fetchLegacyUsersByIds(userIds: string[]) {
  if (userIds.length === 0) {
    return [] as LegacyUser[]
  }

  const rows = await legacyDb.select().from(LegacyUserTable).where(inArray(LegacyUserTable.id, userIds))
  const rowsById = new Map(rows.map((row) => [row.id, row]))
  return userIds.map((userId) => rowsById.get(userId)).filter((row): row is LegacyUser => Boolean(row))
}

async function buildConflictList(plan: Omit<MigrationPlan, "conflicts">) {
  const conflicts: string[] = []
  const emails = unique(plan.includedUsers.map((user) => user.email.trim().toLowerCase()).filter(Boolean))
  const mappedUserIds = plan.includedUsers.map((user) => mapLegacyId("user", user.id))
  const slugs = unique(plan.includedOrgs.map((org) => org.slug).filter(Boolean))

  if (emails.length > 0) {
    const targetUsers = await targetDb
      .select()
      .from(AuthUserTable)
      .where(or(inArray(AuthUserTable.id, mappedUserIds), inArray(AuthUserTable.email, emails)))

    const targetUsersByEmail = new Map(targetUsers.map((row) => [row.email.trim().toLowerCase(), row]))
    for (const user of plan.includedUsers) {
      const existing = targetUsersByEmail.get(user.email.trim().toLowerCase())
      if (!existing) {
        continue
      }

      const mappedId = mapLegacyId("user", user.id)
      if (existing.id !== mappedId) {
        conflicts.push(`User email ${user.email} already exists in the target database with a different id (${existing.id}).`)
      }
    }
  }

  if (slugs.length > 0) {
    const targetOrgs = await targetDb
      .select()
      .from(OrgTable)
      .where(inArray(OrgTable.slug, slugs))

    const targetOrgsBySlug = new Map(targetOrgs.map((row) => [row.slug, row]))
    for (const org of plan.includedOrgs) {
      const existing = targetOrgsBySlug.get(org.slug)
      if (!existing) {
        continue
      }

      const mappedId = mapLegacyId("org", org.id)
      if (existing.id !== mappedId) {
        conflicts.push(`Org slug ${org.slug} already exists in the target database with a different id (${existing.id}).`)
      }
    }
  }

  return conflicts
}

async function buildMigrationPlan(legacyUserIds: string[]) {
  const requestedLegacyUserIds = unique(legacyUserIds.map((value) => value.trim()).filter(Boolean))
  if (requestedLegacyUserIds.length === 0) {
    throw new Error("Select at least one legacy user.")
  }

  const rootUsers = await fetchLegacyUsersByIds(requestedLegacyUserIds)
  if (rootUsers.length !== requestedLegacyUserIds.length) {
    const found = new Set(rootUsers.map((user) => user.id))
    const missing = requestedLegacyUserIds.filter((userId) => !found.has(userId))
    throw new Error(`Missing legacy users: ${missing.join(", ")}`)
  }

  const rootMemberships = await legacyDb
    .select()
    .from(LegacyOrgMembershipTable)
    .where(inArray(LegacyOrgMembershipTable.user_id, requestedLegacyUserIds))

  const orgIds = unique(rootMemberships.map((membership) => membership.org_id))
  const includedOrgs = orgIds.length === 0
    ? []
    : await legacyDb.select().from(LegacyOrgTable).where(inArray(LegacyOrgTable.id, orgIds))

  const includedMemberships = orgIds.length === 0
    ? []
    : await legacyDb.select().from(LegacyOrgMembershipTable).where(inArray(LegacyOrgMembershipTable.org_id, orgIds))

  const includedWorkers = orgIds.length === 0
    ? []
    : await legacyDb.select().from(LegacyWorkerTable).where(inArray(LegacyWorkerTable.org_id, orgIds))

  const includedUserIds = unique([
    ...requestedLegacyUserIds,
    ...includedOrgs.map((org) => org.owner_user_id),
    ...includedMemberships.map((membership) => membership.user_id),
    ...includedWorkers.map((worker) => worker.created_by_user_id).filter((value): value is string => Boolean(value)),
  ])

  const includedUsers = await fetchLegacyUsersByIds(includedUserIds)
  const includedUserIdSet = new Set(includedUsers.map((user) => user.id))

  const warnings: string[] = []
  const unresolvedUserIds = includedUserIds.filter((userId) => !includedUserIdSet.has(userId))
  if (unresolvedUserIds.length > 0) {
    warnings.push(`Skipped ${unresolvedUserIds.length} referenced users that were missing from the legacy user table.`)
  }

  const autoIncludedUsers = includedUsers.filter((user) => !requestedLegacyUserIds.includes(user.id))

  const includedAccounts = includedUserIdSet.size === 0
    ? []
    : await legacyDb.select().from(LegacyAccountTable).where(inArray(LegacyAccountTable.userId, Array.from(includedUserIdSet)))

  const workerIds = includedWorkers.map((worker) => worker.id)
  const includedWorkerInstances = workerIds.length === 0
    ? []
    : await legacyDb.select().from(LegacyWorkerInstanceTable).where(inArray(LegacyWorkerInstanceTable.worker_id, workerIds))

  const includedWorkerTokens = workerIds.length === 0
    ? []
    : await legacyDb.select().from(LegacyWorkerTokenTable).where(inArray(LegacyWorkerTokenTable.worker_id, workerIds))

  const includedWorkerBundles = workerIds.length === 0
    ? []
    : await legacyDb.select().from(LegacyWorkerBundleTable).where(inArray(LegacyWorkerBundleTable.worker_id, workerIds))

  const includedEmails = unique(includedUsers.map((user) => user.email))
  const includedAdminAllowlist = includedEmails.length === 0
    ? []
    : await legacyDb.select().from(LegacyAdminAllowlistTable).where(inArray(LegacyAdminAllowlistTable.email, includedEmails))

  const provisionalPlan = {
    requestedLegacyUserIds,
    rootUsers,
    includedUsers,
    includedAccounts,
    includedOrgs,
    includedMemberships: includedMemberships.filter((membership) => includedUserIdSet.has(membership.user_id)),
    includedWorkers,
    includedWorkerInstances,
    includedWorkerTokens,
    includedWorkerBundles,
    includedAdminAllowlist,
    autoIncludedUsers,
    warnings,
  }

  const conflicts = await buildConflictList(provisionalPlan)
  return {
    ...provisionalPlan,
    conflicts,
  } satisfies MigrationPlan
}

function summarizePlan(plan: MigrationPlan): MigrationSummary {
  return {
    rootUsers: plan.rootUsers.length,
    totalUsers: plan.includedUsers.length,
    autoIncludedUsers: plan.autoIncludedUsers.length,
    accounts: plan.includedAccounts.length,
    orgs: plan.includedOrgs.length,
    memberships: plan.includedMemberships.length,
    workers: plan.includedWorkers.length,
    workerInstances: plan.includedWorkerInstances.length,
    workerTokens: plan.includedWorkerTokens.length,
    workerBundles: plan.includedWorkerBundles.length,
    adminAllowlistRows: plan.includedAdminAllowlist.length,
  }
}

async function upsertUsers(users: LegacyUser[]) {
  for (const batch of chunk(users, 50)) {
    await targetDb.insert(AuthUserTable).values(
      batch.map((user) => ({
        id: mapLegacyId("user", user.id),
        name: user.name,
        email: user.email,
        emailVerified: user.emailVerified,
        image: user.image,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      })),
    ).onDuplicateKeyUpdate({
      set: {
        name: sql`values(${AuthUserTable.name})`,
        email: sql`values(${AuthUserTable.email})`,
        emailVerified: sql`values(${AuthUserTable.emailVerified})`,
        image: sql`values(${AuthUserTable.image})`,
        updatedAt: sql`values(${AuthUserTable.updatedAt})`,
      },
    })
  }
}

async function upsertAccounts(accounts: LegacyAccount[]) {
  for (const batch of chunk(accounts, 50)) {
    await targetDb.insert(AuthAccountTable).values(
      batch.map((account) => ({
        id: mapLegacyId("account", account.id),
        userId: mapLegacyId("user", account.userId),
        accountId: account.accountId,
        providerId: account.providerId,
        accessToken: account.accessToken,
        refreshToken: account.refreshToken,
        accessTokenExpiresAt: account.accessTokenExpiresAt,
        refreshTokenExpiresAt: account.refreshTokenExpiresAt,
        scope: account.scope,
        idToken: account.idToken,
        password: account.password,
        createdAt: account.createdAt,
        updatedAt: account.updatedAt,
      })),
    ).onDuplicateKeyUpdate({
      set: {
        userId: sql`values(${AuthAccountTable.userId})`,
        accountId: sql`values(${AuthAccountTable.accountId})`,
        providerId: sql`values(${AuthAccountTable.providerId})`,
        accessToken: sql`values(${AuthAccountTable.accessToken})`,
        refreshToken: sql`values(${AuthAccountTable.refreshToken})`,
        accessTokenExpiresAt: sql`values(${AuthAccountTable.accessTokenExpiresAt})`,
        refreshTokenExpiresAt: sql`values(${AuthAccountTable.refreshTokenExpiresAt})`,
        scope: sql`values(${AuthAccountTable.scope})`,
        idToken: sql`values(${AuthAccountTable.idToken})`,
        password: sql`values(${AuthAccountTable.password})`,
        updatedAt: sql`values(${AuthAccountTable.updatedAt})`,
      },
    })
  }
}

async function upsertAdminAllowlist(rows: LegacyAdminAllowlist[]) {
  for (const batch of chunk(rows, 50)) {
    await targetDb.insert(AdminAllowlistTable).values(
      batch.map((row) => ({
        id: mapLegacyId("adminAllowlist", row.id),
        email: row.email,
        note: row.note,
        created_at: row.created_at,
        updated_at: row.updated_at,
      })),
    ).onDuplicateKeyUpdate({
      set: {
        email: sql`values(${AdminAllowlistTable.email})`,
        note: sql`values(${AdminAllowlistTable.note})`,
        updated_at: sql`values(${AdminAllowlistTable.updated_at})`,
      },
    })
  }
}

async function upsertOrgs(orgs: LegacyOrg[]) {
  for (const batch of chunk(orgs, 50)) {
    await targetDb.insert(OrgTable).values(
      batch.map((org) => ({
        id: mapLegacyId("org", org.id),
        name: org.name,
        slug: org.slug,
        owner_user_id: mapLegacyId("user", org.owner_user_id),
        created_at: org.created_at,
        updated_at: org.updated_at,
      })),
    ).onDuplicateKeyUpdate({
      set: {
        name: sql`values(${OrgTable.name})`,
        slug: sql`values(${OrgTable.slug})`,
        owner_user_id: sql`values(${OrgTable.owner_user_id})`,
        updated_at: sql`values(${OrgTable.updated_at})`,
      },
    })
  }
}

async function upsertMemberships(rows: LegacyOrgMembership[]) {
  for (const batch of chunk(rows, 50)) {
    await targetDb.insert(OrgMembershipTable).values(
      batch.map((row) => ({
        id: mapLegacyId("orgMembership", row.id),
        org_id: mapLegacyId("org", row.org_id),
        user_id: mapLegacyId("user", row.user_id),
        role: row.role,
        created_at: row.created_at,
      })),
    ).onDuplicateKeyUpdate({
      set: {
        org_id: sql`values(${OrgMembershipTable.org_id})`,
        user_id: sql`values(${OrgMembershipTable.user_id})`,
        role: sql`values(${OrgMembershipTable.role})`,
      },
    })
  }
}

async function upsertWorkers(rows: LegacyWorker[], knownUserIds: Set<string>) {
  for (const batch of chunk(rows, 50)) {
    await targetDb.insert(WorkerTable).values(
      batch.map((row) => ({
        id: mapLegacyId("worker", row.id),
        org_id: mapLegacyId("org", row.org_id),
        created_by_user_id: row.created_by_user_id && knownUserIds.has(row.created_by_user_id)
          ? mapLegacyId("user", row.created_by_user_id)
          : null,
        name: row.name,
        description: row.description,
        destination: row.destination,
        status: row.status,
        image_version: row.image_version,
        workspace_path: row.workspace_path,
        sandbox_backend: row.sandbox_backend,
        created_at: row.created_at,
        updated_at: row.updated_at,
      })),
    ).onDuplicateKeyUpdate({
      set: {
        org_id: sql`values(${WorkerTable.org_id})`,
        created_by_user_id: sql`values(${WorkerTable.created_by_user_id})`,
        name: sql`values(${WorkerTable.name})`,
        description: sql`values(${WorkerTable.description})`,
        destination: sql`values(${WorkerTable.destination})`,
        status: sql`values(${WorkerTable.status})`,
        image_version: sql`values(${WorkerTable.image_version})`,
        workspace_path: sql`values(${WorkerTable.workspace_path})`,
        sandbox_backend: sql`values(${WorkerTable.sandbox_backend})`,
        updated_at: sql`values(${WorkerTable.updated_at})`,
      },
    })
  }
}

async function upsertWorkerInstances(rows: LegacyWorkerInstance[]) {
  for (const batch of chunk(rows, 50)) {
    await targetDb.insert(WorkerInstanceTable).values(
      batch.map((row) => ({
        id: mapLegacyId("workerInstance", row.id),
        worker_id: mapLegacyId("worker", row.worker_id),
        provider: row.provider,
        region: row.region,
        url: row.url,
        status: row.status,
        created_at: row.created_at,
        updated_at: row.updated_at,
      })),
    ).onDuplicateKeyUpdate({
      set: {
        worker_id: sql`values(${WorkerInstanceTable.worker_id})`,
        provider: sql`values(${WorkerInstanceTable.provider})`,
        region: sql`values(${WorkerInstanceTable.region})`,
        url: sql`values(${WorkerInstanceTable.url})`,
        status: sql`values(${WorkerInstanceTable.status})`,
        updated_at: sql`values(${WorkerInstanceTable.updated_at})`,
      },
    })
  }
}

async function upsertWorkerTokens(rows: LegacyWorkerToken[]) {
  for (const batch of chunk(rows, 50)) {
    await targetDb.insert(WorkerTokenTable).values(
      batch.map((row) => ({
        id: mapLegacyId("workerToken", row.id),
        worker_id: mapLegacyId("worker", row.worker_id),
        scope: row.scope,
        token: row.token,
        created_at: row.created_at,
        revoked_at: row.revoked_at,
      })),
    ).onDuplicateKeyUpdate({
      set: {
        worker_id: sql`values(${WorkerTokenTable.worker_id})`,
        scope: sql`values(${WorkerTokenTable.scope})`,
        token: sql`values(${WorkerTokenTable.token})`,
        revoked_at: sql`values(${WorkerTokenTable.revoked_at})`,
      },
    })
  }
}

async function upsertWorkerBundles(rows: LegacyWorkerBundle[]) {
  for (const batch of chunk(rows, 50)) {
    await targetDb.insert(WorkerBundleTable).values(
      batch.map((row) => ({
        id: mapLegacyId("workerBundle", row.id),
        worker_id: mapLegacyId("worker", row.worker_id),
        storage_url: row.storage_url,
        status: row.status,
        created_at: row.created_at,
      })),
    ).onDuplicateKeyUpdate({
      set: {
        worker_id: sql`values(${WorkerBundleTable.worker_id})`,
        storage_url: sql`values(${WorkerBundleTable.storage_url})`,
        status: sql`values(${WorkerBundleTable.status})`,
      },
    })
  }
}

export async function listLegacyUsers(query: string) {
  const normalizedQuery = query.trim()
  const filters = normalizedQuery
    ? or(
        like(LegacyUserTable.email, `%${normalizedQuery}%`),
        like(LegacyUserTable.name, `%${normalizedQuery}%`),
      )
    : undefined

  const users = await legacyDb
    .select()
    .from(LegacyUserTable)
    .where(filters)
    .orderBy(desc(LegacyUserTable.createdAt))
    .limit(env.listUsersLimit)

  if (users.length === 0) {
    return [] as ListedLegacyUser[]
  }

  const userIds = users.map((user) => user.id)
  const accountRows = await legacyDb
    .select({ userId: LegacyAccountTable.userId, count: sql<number>`count(*)` })
    .from(LegacyAccountTable)
    .where(inArray(LegacyAccountTable.userId, userIds))
    .groupBy(LegacyAccountTable.userId)

  const membershipRows = await legacyDb
    .select({ userId: LegacyOrgMembershipTable.user_id, orgId: LegacyOrgMembershipTable.org_id })
    .from(LegacyOrgMembershipTable)
    .where(inArray(LegacyOrgMembershipTable.user_id, userIds))

  const orgIds = unique(membershipRows.map((row) => row.orgId))
  const workerRows = orgIds.length === 0
    ? []
    : await legacyDb
        .select({ orgId: LegacyWorkerTable.org_id, workerId: LegacyWorkerTable.id })
        .from(LegacyWorkerTable)
        .where(inArray(LegacyWorkerTable.org_id, orgIds))

  const sessionRows = await legacyDb
    .select({
      userId: LegacySessionTable.userId,
      count: sql<number>`count(*)`,
      lastSeenAt: sql<Date | string | null>`max(${LegacySessionTable.updatedAt})`,
    })
    .from(LegacySessionTable)
    .where(inArray(LegacySessionTable.userId, userIds))
    .groupBy(LegacySessionTable.userId)

  const mappedUserIds = users.map((user) => mapLegacyId("user", user.id))
  const emails = users.map((user) => user.email)
  const targetUsers = await targetDb
    .select()
    .from(AuthUserTable)
    .where(or(inArray(AuthUserTable.id, mappedUserIds), inArray(AuthUserTable.email, emails)))

  const accountCounts = new Map(accountRows.map((row) => [row.userId, toNumber(row.count)]))
  const orgCounts = new Map<string, number>()
  const orgIdsByUser = new Map<string, Set<string>>()
  for (const row of membershipRows) {
    orgCounts.set(row.userId, (orgCounts.get(row.userId) ?? 0) + 1)
    const existing = orgIdsByUser.get(row.userId) ?? new Set<string>()
    existing.add(row.orgId)
    orgIdsByUser.set(row.userId, existing)
  }

  const workerIdsByOrg = new Map<string, Set<string>>()
  for (const row of workerRows) {
    const existing = workerIdsByOrg.get(row.orgId) ?? new Set<string>()
    existing.add(row.workerId)
    workerIdsByOrg.set(row.orgId, existing)
  }

  const workerCounts = new Map<string, number>()
  for (const [userId, linkedOrgIds] of orgIdsByUser.entries()) {
    const workerIds = new Set<string>()
    for (const orgId of linkedOrgIds) {
      for (const workerId of workerIdsByOrg.get(orgId) ?? []) {
        workerIds.add(workerId)
      }
    }
    workerCounts.set(userId, workerIds.size)
  }

  const sessionsByUser = new Map(sessionRows.map((row) => [row.userId, row]))
  const targetUsersByEmail = new Map(targetUsers.map((row) => [row.email.trim().toLowerCase(), row]))
  const targetUsersById = new Map(targetUsers.map((row) => [row.id, row]))

  return users.map((user) => {
    const mappedTargetUserId = mapLegacyId("user", user.id)
    const targetById = targetUsersById.get(mappedTargetUserId)
    const targetByEmail = targetUsersByEmail.get(user.email.trim().toLowerCase())

    let status: UserStatus = "pending"
    let conflictReason: string | null = null
    if (targetById) {
      status = "migrated"
    } else if (targetByEmail) {
      status = "conflict"
      conflictReason = `Target already has ${user.email} as ${targetByEmail.id}.`
    }

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      lastSeenAt: sessionsByUser.get(user.id)?.lastSeenAt ?? null,
      accountCount: accountCounts.get(user.id) ?? 0,
      orgCount: orgCounts.get(user.id) ?? 0,
      workerCount: workerCounts.get(user.id) ?? 0,
      status,
      mappedTargetUserId,
      conflictReason,
    }
  })
}

export async function previewMigration(legacyUserIds: string[]) {
  const plan = await buildMigrationPlan(legacyUserIds)
  return {
    summary: summarizePlan(plan),
    roots: plan.rootUsers.map((user) => ({ id: user.id, email: user.email, name: user.name })),
    autoIncludedUsers: plan.autoIncludedUsers.map((user) => ({ id: user.id, email: user.email, name: user.name })),
    warnings: plan.warnings,
    conflicts: plan.conflicts,
  }
}

export async function runMigration(legacyUserIds: string[]) {
  const plan = await buildMigrationPlan(legacyUserIds)
  if (plan.conflicts.length > 0) {
    throw new Error(plan.conflicts.join("\n"))
  }

  const knownUserIds = new Set(plan.includedUsers.map((user) => user.id))

  await upsertUsers(plan.includedUsers)
  await upsertAccounts(plan.includedAccounts)
  await upsertAdminAllowlist(plan.includedAdminAllowlist)
  await upsertOrgs(plan.includedOrgs)
  await upsertMemberships(plan.includedMemberships)
  await upsertWorkers(plan.includedWorkers, knownUserIds)
  await upsertWorkerInstances(plan.includedWorkerInstances)
  await upsertWorkerTokens(plan.includedWorkerTokens)
  await upsertWorkerBundles(plan.includedWorkerBundles)

  return {
    summary: summarizePlan(plan),
    migratedUsers: plan.includedUsers.map((user) => ({
      legacyUserId: user.id,
      targetUserId: mapLegacyId("user", user.id),
      email: user.email,
      name: user.name,
      root: plan.requestedLegacyUserIds.includes(user.id),
    })),
    warnings: plan.warnings,
  }
}
