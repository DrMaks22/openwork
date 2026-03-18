import { env } from "./env.js"

type RenderService = {
  id: string
  name?: string
  slug?: string
  serviceDetails?: {
    url?: string
    region?: string
  }
}

type RenderServiceListRow = {
  cursor?: string
  service?: RenderService
}

function assertRenderConfig() {
  if (!env.render.apiKey) {
    throw new Error("RENDER_API_KEY is required for Render worker cleanup")
  }
}

export function hostFromUrl(value: string | null | undefined) {
  if (!value) {
    return ""
  }

  try {
    return new URL(value).host.toLowerCase()
  } catch {
    return ""
  }
}

async function renderRequest<T>(
  path: string,
  init: RequestInit = {},
  tolerateStatuses: number[] = [],
): Promise<T | null> {
  assertRenderConfig()

  const headers = new Headers(init.headers)
  headers.set("Authorization", `Bearer ${env.render.apiKey}`)
  headers.set("Accept", "application/json")

  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json")
  }

  const response = await fetch(`${env.render.apiBase}${path}`, {
    ...init,
    headers,
  })

  const text = await response.text()
  if (!response.ok) {
    if (tolerateStatuses.includes(response.status)) {
      return null
    }

    throw new Error(`Render API ${path} failed (${response.status}): ${text.slice(0, 300)}`)
  }

  if (!text) {
    return null
  }

  return JSON.parse(text) as T
}

export async function listRenderServices(limit = 200) {
  const rows: RenderService[] = []
  let cursor: string | undefined

  while (rows.length < limit) {
    const query = new URLSearchParams({ limit: "100" })
    if (cursor) {
      query.set("cursor", cursor)
    }

    const page = await renderRequest<RenderServiceListRow[]>(`/services?${query.toString()}`)
    if (!page || page.length === 0) {
      break
    }

    rows.push(
      ...page
        .map((entry) => entry.service)
        .filter((entry): entry is RenderService => Boolean(entry?.id)),
    )

    const nextCursor = page[page.length - 1]?.cursor
    if (!nextCursor || nextCursor === cursor) {
      break
    }

    cursor = nextCursor
  }

  return rows.slice(0, limit)
}

export async function suspendRenderService(serviceId: string) {
  await renderRequest(`/services/${serviceId}/suspend`, {
    method: "POST",
    body: JSON.stringify({}),
  }, [404])
}

export async function deleteRenderService(serviceId: string) {
  await renderRequest(`/services/${serviceId}`, {
    method: "DELETE",
  }, [404])
}
