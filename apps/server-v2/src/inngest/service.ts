import { inngest } from "./client.js";
import { RouteError } from "../http.js";

/**
 * In-memory automation store. In production this would live in SQLite alongside
 * the existing server-v2 persistence layer, but for the initial integration we
 * keep it simple so there are zero migration requirements.
 */

export type Automation = {
  id: string;
  name: string;
  description: string;
  prompt: string;
  /** ISO-8601 cron or "manual" */
  schedule: string;
  enabled: boolean;
  workspaceId: string;
  createdAt: string;
  updatedAt: string;
  lastRunAt: string | null;
  lastRunStatus: "pending" | "running" | "success" | "failed" | null;
  lastSessionId: string | null;
};

export type CreateAutomationInput = {
  name: string;
  description?: string;
  prompt: string;
  schedule?: string;
  workspaceId: string;
};

export type InngestServiceConfig = {
  serverBaseUrl: string;
  authToken?: string;
};

function generateId() {
  return `auto_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export type InngestService = ReturnType<typeof createInngestService>;

export function createInngestService(config: InngestServiceConfig) {
  const automations = new Map<string, Automation>();

  return {
    getConfig() {
      return { ...config };
    },

    listAutomations(workspaceId: string): Automation[] {
      const items: Automation[] = [];
      for (const auto of automations.values()) {
        if (auto.workspaceId === workspaceId) {
          items.push({ ...auto });
        }
      }
      items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      return items;
    },

    getAutomation(id: string): Automation | null {
      const auto = automations.get(id);
      return auto ? { ...auto } : null;
    },

    createAutomation(input: CreateAutomationInput): Automation {
      const now = new Date().toISOString();
      const auto: Automation = {
        id: generateId(),
        name: input.name.trim() || "Untitled Automation",
        description: input.description?.trim() ?? "",
        prompt: input.prompt.trim(),
        schedule: input.schedule?.trim() || "manual",
        enabled: true,
        workspaceId: input.workspaceId,
        createdAt: now,
        updatedAt: now,
        lastRunAt: null,
        lastRunStatus: null,
        lastSessionId: null,
      };

      if (!auto.prompt) {
        throw new RouteError(400, "invalid_request", "prompt is required");
      }

      automations.set(auto.id, auto);
      return { ...auto };
    },

    deleteAutomation(id: string): void {
      if (!automations.has(id)) {
        throw new RouteError(404, "not_found", `Automation not found: ${id}`);
      }
      automations.delete(id);
    },

    async triggerAutomation(id: string): Promise<{ eventId: string; sessionId?: string }> {
      const auto = automations.get(id);
      if (!auto) {
        throw new RouteError(404, "not_found", `Automation not found: ${id}`);
      }

      auto.lastRunAt = new Date().toISOString();
      auto.lastRunStatus = "running";
      auto.updatedAt = auto.lastRunAt;

      try {
        const sendResult = await inngest.send({
          name: "automation/run",
          data: {
            prompt: auto.prompt,
            workspaceId: auto.workspaceId,
            serverBaseUrl: config.serverBaseUrl,
            authToken: config.authToken,
            automationId: auto.id,
            automationName: auto.name,
          },
        });

        return { eventId: (sendResult as any)?.ids?.[0] ?? "sent" };
      } catch (error) {
        auto.lastRunStatus = "failed";
        auto.updatedAt = new Date().toISOString();

        // If Inngest dev server is not reachable, fall back to direct execution
        console.warn("[inngest] Dev server unreachable, executing directly:", error instanceof Error ? error.message : error);

        return this.triggerDirect(id);
      }
    },

    /** Direct execution fallback when Inngest dev server is not running. */
    async triggerDirect(id: string): Promise<{ eventId: string; sessionId?: string }> {
      const auto = automations.get(id);
      if (!auto) {
        throw new RouteError(404, "not_found", `Automation not found: ${id}`);
      }

      auto.lastRunAt = new Date().toISOString();
      auto.lastRunStatus = "running";
      auto.updatedAt = auto.lastRunAt;

      try {
        const headers: Record<string, string> = { "Content-Type": "application/json" };
        if (config.authToken) {
          headers["Authorization"] = `Bearer ${config.authToken}`;
        }

        // Create session
        const createRes = await fetch(`${config.serverBaseUrl}/workspaces/${auto.workspaceId}/sessions`, {
          method: "POST",
          headers,
          body: JSON.stringify({}),
        });

        if (!createRes.ok) {
          throw new Error(`Failed to create session: ${createRes.status}`);
        }

        const sessionData = (await createRes.json()) as { data?: { id?: string } };
        const sessionId = sessionData?.data?.id;
        if (!sessionId) {
          throw new Error("No session ID returned");
        }

        // Send prompt
        const promptRes = await fetch(
          `${config.serverBaseUrl}/workspaces/${auto.workspaceId}/sessions/${sessionId}/prompt_async`,
          {
            method: "POST",
            headers,
            body: JSON.stringify({ content: auto.prompt }),
          },
        );

        if (!promptRes.ok) {
          throw new Error(`Failed to send prompt: ${promptRes.status}`);
        }

        auto.lastRunStatus = "success";
        auto.lastSessionId = sessionId;
        auto.updatedAt = new Date().toISOString();

        return { eventId: "direct", sessionId };
      } catch (error) {
        auto.lastRunStatus = "failed";
        auto.updatedAt = new Date().toISOString();
        throw error instanceof RouteError
          ? error
          : new RouteError(500, "internal_error", error instanceof Error ? error.message : "Automation execution failed");
      }
    },
  };
}
