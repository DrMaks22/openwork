import { Buffer } from "node:buffer"
import { and, eq } from "@openwork-ee/den-db/drizzle"
import { AuthAccountTable, MemberTable, ScimProviderTable } from "@openwork-ee/den-db/schema"
import { auth } from "./auth.js"
import { db } from "./db.js"
import { env } from "./env.js"
import { removeOrganizationMember } from "./orgs.js"

type OrganizationId = typeof MemberTable.$inferSelect.organizationId
type UserId = typeof MemberTable.$inferSelect.userId

function decodeBase64Url(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/")
  const padding = normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4))
  return Buffer.from(`${normalized}${padding}`, "base64").toString("utf8")
}

export function buildOrganizationScimProviderId(organizationId: OrganizationId) {
  return `openwork-scim-${organizationId}`
}

export function getScimBaseUrl() {
  return `${env.betterAuthUrl}/api/auth/scim/v2`
}

export async function getOrganizationScimConnection(organizationId: OrganizationId) {
  const rows = await db
    .select()
    .from(ScimProviderTable)
    .where(eq(ScimProviderTable.organizationId, organizationId))
    .limit(1)

  return rows[0] ?? null
}

export async function rotateOrganizationScimToken(input: {
  organizationId: OrganizationId
  headers: Headers
}) {
  const existing = await getOrganizationScimConnection(input.organizationId)
  const providerId = buildOrganizationScimProviderId(input.organizationId)

  if (existing && existing.providerId !== providerId) {
    await db.delete(ScimProviderTable).where(eq(ScimProviderTable.id, existing.id))
  }

  const generated = await auth.api.generateSCIMToken({
    body: {
      providerId,
      organizationId: input.organizationId,
    },
    headers: input.headers,
  })

  const connection = await getOrganizationScimConnection(input.organizationId)
  if (!connection) {
    throw new Error("SCIM connection was created, but could not be loaded.")
  }

  return {
    connection,
    scimToken: generated.scimToken,
  }
}

export async function deleteOrganizationScimConnection(organizationId: OrganizationId) {
  const connection = await getOrganizationScimConnection(organizationId)
  if (!connection) {
    return false
  }

  await db.delete(ScimProviderTable).where(eq(ScimProviderTable.id, connection.id))
  return true
}

export async function deleteScimProvisionedAccess(input: {
  bearerToken: string
  userId: UserId
}) {
  let decoded: string
  try {
    decoded = decodeBase64Url(input.bearerToken)
  } catch {
    return { ok: false as const, status: 401, body: { detail: "Invalid SCIM token" } }
  }

  const [rawToken, providerId, ...organizationParts] = decoded.split(":")
  const organizationId = organizationParts.join(":")

  if (!rawToken || !providerId || !organizationId) {
    return { ok: false as const, status: 401, body: { detail: "Invalid SCIM token" } }
  }

  const providerRows = await db
    .select()
    .from(ScimProviderTable)
    .where(and(eq(ScimProviderTable.providerId, providerId), eq(ScimProviderTable.organizationId, organizationId as OrganizationId)))
    .limit(1)

  const provider = providerRows[0] ?? null
  if (!provider || provider.scimToken !== rawToken) {
    return { ok: false as const, status: 401, body: { detail: "Invalid SCIM token" } }
  }

  const accountRows = await db
    .select()
    .from(AuthAccountTable)
    .where(and(eq(AuthAccountTable.userId, input.userId), eq(AuthAccountTable.providerId, providerId)))
    .limit(1)

  const memberRows = await db
    .select()
    .from(MemberTable)
    .where(and(eq(MemberTable.userId, input.userId), eq(MemberTable.organizationId, organizationId as OrganizationId)))
    .limit(1)

  const account = accountRows[0] ?? null
  const member = memberRows[0] ?? null
  if (!account || !member) {
    return { ok: false as const, status: 404, body: { detail: "User not found" } }
  }

  await removeOrganizationMember({
    organizationId: organizationId as OrganizationId,
    memberId: member.id,
  })

  await db.delete(AuthAccountTable).where(eq(AuthAccountTable.id, account.id))

  return { ok: true as const }
}
