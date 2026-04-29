import { inngest } from "./client.js";
import { RouteError } from "../http.js";
import type { WorkspaceSessionService } from "../services/workspace-session-service.js";

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
  sessions: WorkspaceSessionService;
};

function generateId() {
  return `auto_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export type InngestService = ReturnType<typeof createInngestService>;

export function createInngestService(config: InngestServiceConfig) {
  const automations = new Map<string, Automation>();

  return {
    getConfig() {
      return { serverBaseUrl: config.serverBaseUrl, authToken: config.authToken };
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
        // Create session using the session service directly (no HTTP self-call)
        const session = await config.sessions.createSession(auto.workspaceId, {});
        const sessionId = (session as any)?.id;
        if (!sessionId) {
          throw new Error("No session ID returned from createSession");
        }

        // Send prompt using the session service directly
        await config.sessions.promptAsync(auto.workspaceId, sessionId, {
          parts: [{ type: "text", text: auto.prompt }],
        });

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
