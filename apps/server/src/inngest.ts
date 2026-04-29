/**
 * Inngest-powered automations for OpenWork server (v1).
 *
 * Provides an in-memory automation store and functions to create, trigger, and
 * manage automation workflows. Triggered automations create an OpenCode session
 * and send the configured prompt.
 */

import { Inngest } from "inngest";

// ── Inngest client ──────────────────────────────────────────────────────

export const inngest = new Inngest({ id: "openwork" });

// ── Types ───────────────────────────────────────────────────────────────

export type Automation = {
  id: string;
  name: string;
  description: string;
  prompt: string;
  schedule: string; // "manual" or cron expression
  enabled: boolean;
  workspaceId: string;
  createdAt: string;
  updatedAt: string;
  lastRunAt: string | null;
  lastRunStatus: "pending" | "running" | "success" | "failed" | null;
  lastRunError: string | null;
  lastSessionId: string | null;
};

export type CreateAutomationInput = {
  name?: string;
  description?: string;
  prompt: string;
  schedule?: string;
};

// ── In-memory store ─────────────────────────────────────────────────────

const automations = new Map<string, Automation>();

function generateId() {
  return `auto_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function listAutomations(workspaceId: string): Automation[] {
  const items: Automation[] = [];
  for (const auto of automations.values()) {
    if (auto.workspaceId === workspaceId) {
      items.push({ ...auto });
    }
  }
  items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return items;
}

export function getAutomation(id: string): Automation | null {
  const auto = automations.get(id);
  return auto ? { ...auto } : null;
}

export function createAutomation(workspaceId: string, input: CreateAutomationInput): Automation {
  const prompt = (input.prompt ?? "").trim();
  if (!prompt) {
    throw Object.assign(new Error("prompt is required"), { status: 400 });
  }

  const now = new Date().toISOString();
  const auto: Automation = {
    id: generateId(),
    name: (input.name ?? "").trim() || "Untitled Automation",
    description: (input.description ?? "").trim(),
    prompt,
    schedule: (input.schedule ?? "").trim() || "manual",
    enabled: true,
    workspaceId,
    createdAt: now,
    updatedAt: now,
    lastRunAt: null,
    lastRunStatus: null,
    lastRunError: null,
    lastSessionId: null,
  };

  automations.set(auto.id, auto);
  return { ...auto };
}

export function deleteAutomation(id: string): Automation {
  const auto = automations.get(id);
  if (!auto) {
    throw Object.assign(new Error(`Automation not found: ${id}`), { status: 404 });
  }
  automations.delete(id);
  return { ...auto };
}

// ── Trigger ─────────────────────────────────────────────────────────────

type FetchOpencodeJsonFn = (
  path: string,
  init: { method: string; body?: unknown },
) => Promise<unknown>;

/**
 * Trigger an automation by creating an OpenCode session and sending the prompt.
 *
 * Attempts to send the event through Inngest first. If the Inngest dev server
 * is unreachable, falls back to direct execution via the OpenCode API.
 */
export async function triggerAutomation(
  id: string,
  fetchOpencode: FetchOpencodeJsonFn,
): Promise<{ eventId: string; sessionId?: string }> {
  const auto = automations.get(id);
  if (!auto) {
    throw Object.assign(new Error(`Automation not found: ${id}`), { status: 404 });
  }

  auto.lastRunAt = new Date().toISOString();
  auto.lastRunStatus = "running";
  auto.lastRunError = null;
  auto.updatedAt = auto.lastRunAt;

  // Always use direct execution for now -- the Inngest durable path requires
  // the Inngest dev server to call back into our /api/inngest endpoint which
  // needs more wiring in the Electron flow. Direct execution works reliably.
  return triggerDirect(auto, fetchOpencode);
}

async function triggerDirect(
  auto: Automation,
  fetchOpencode: FetchOpencodeJsonFn,
): Promise<{ eventId: string; sessionId?: string }> {
  try {
    // Step 1: Create a new session
    const sessionResult = await fetchOpencode("/session", {
      method: "POST",
      body: {},
    }) as { id?: string };

    const sessionId = sessionResult?.id;
    if (!sessionId) {
      throw new Error("Session creation did not return an ID");
    }

    // Step 2: Send the prompt (OpenCode expects `parts` format, returns 204)
    try {
      await fetchOpencode(`/session/${sessionId}/prompt_async`, {
        method: "POST",
        body: { parts: [{ type: "text", text: auto.prompt }] },
      });
    } catch (err: unknown) {
      // prompt_async returns 204 No Content on success, which fetchOpencodeJson
      // may interpret as an error because there's no JSON body. That's fine.
      const status = (err as any)?.status ?? (err as any)?.details?.status;
      if (status !== 204) {
        throw err;
      }
    }

    auto.lastRunStatus = "success";
    auto.lastSessionId = sessionId;
    auto.lastRunError = null;
    auto.updatedAt = new Date().toISOString();

    return { eventId: "direct", sessionId };
  } catch (error: unknown) {
    auto.lastRunStatus = "failed";
    auto.lastRunError = error instanceof Error ? error.message : String(error);
    auto.updatedAt = new Date().toISOString();
    throw error;
  }
}

// ── Inngest functions (for Inngest serve endpoint) ──────────────────────

export const runAutomationFn = inngest.createFunction(
  {
    id: "run-automation",
    retries: 2,
    triggers: [{ event: "automation/run" }],
  },
  async ({ event, step }: any) => {
    const { prompt, workspaceId, serverBaseUrl, authToken } = event.data as {
      prompt: string;
      workspaceId: string;
      serverBaseUrl: string;
      authToken?: string;
    };

    const session = await step.run("create-session", async () => {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (authToken) headers["Authorization"] = `Bearer ${authToken}`;
      const res = await fetch(`${serverBaseUrl}/workspace/${workspaceId}/opencode/session`, {
        method: "POST",
        headers,
        body: JSON.stringify({}),
      });
      if (!res.ok) throw new Error(`Failed to create session: ${res.status}`);
      return (await res.json()) as { id: string };
    });

    const sessionId = session?.id;
    if (!sessionId) throw new Error("No session ID returned");

    await step.run("send-prompt", async () => {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (authToken) headers["Authorization"] = `Bearer ${authToken}`;
      const res = await fetch(
        `${serverBaseUrl}/workspace/${workspaceId}/opencode/session/${sessionId}/prompt_async`,
        {
          method: "POST",
          headers,
          body: JSON.stringify({ parts: [{ type: "text", text: prompt }] }),
        },
      );
      // 204 is success for prompt_async
      if (!res.ok && res.status !== 204) throw new Error(`Failed: ${res.status}`);
      return { sent: true };
    });

    return { sessionId, prompt, workspaceId, completedAt: new Date().toISOString() };
  },
);

export const inngestFunctions = [runAutomationFn];
