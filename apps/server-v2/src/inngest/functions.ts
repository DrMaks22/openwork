import { inngest } from "./client.js";

/**
 * Inngest function: run an automation workflow.
 *
 * Triggered by the "automation/run" event. Creates an OpenCode session and
 * sends the user's prompt. The function uses durable steps so each phase is
 * retryable independently.
 */
export const runAutomation = inngest.createFunction(
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

    // Step 1: Create a new session
    const session = await step.run("create-session", async () => {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (authToken) {
        headers["Authorization"] = `Bearer ${authToken}`;
      }
      const res = await fetch(`${serverBaseUrl}/workspaces/${workspaceId}/sessions`, {
        method: "POST",
        headers,
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`Failed to create session: ${res.status} ${text}`);
      }
      return (await res.json()) as { data: { id: string } };
    });

    const sessionId = session.data?.id;
    if (!sessionId) {
      throw new Error("Session creation did not return an ID");
    }

    // Step 2: Send the prompt
    const promptResult = await step.run("send-prompt", async () => {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (authToken) {
        headers["Authorization"] = `Bearer ${authToken}`;
      }
      const res = await fetch(
        `${serverBaseUrl}/workspaces/${workspaceId}/sessions/${sessionId}/prompt_async`,
        {
          method: "POST",
          headers,
          body: JSON.stringify({ content: prompt }),
        },
      );
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`Failed to send prompt: ${res.status} ${text}`);
      }
      return (await res.json()) as Record<string, unknown>;
    });

    return {
      sessionId,
      prompt,
      workspaceId,
      promptResult,
      completedAt: new Date().toISOString(),
    };
  },
);

/**
 * Inngest function: scheduled automation.
 *
 * Triggered by "automation/scheduled". Same as run-automation but designed
 * for cron-triggered workflows.
 */
export const scheduledAutomation = inngest.createFunction(
  {
    id: "scheduled-automation",
    retries: 2,
    triggers: [{ event: "automation/scheduled" }],
  },
  async ({ event, step }: any) => {
    const { prompt, workspaceId, serverBaseUrl, authToken, automationId, automationName } =
      event.data as {
        prompt: string;
        workspaceId: string;
        serverBaseUrl: string;
        authToken?: string;
        automationId: string;
        automationName: string;
      };

    const session = await step.run("create-session", async () => {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (authToken) {
        headers["Authorization"] = `Bearer ${authToken}`;
      }
      const res = await fetch(`${serverBaseUrl}/workspaces/${workspaceId}/sessions`, {
        method: "POST",
        headers,
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        throw new Error(`Failed to create session: ${res.status}`);
      }
      return (await res.json()) as { data: { id: string } };
    });

    const sessionId = session.data?.id;
    if (!sessionId) {
      throw new Error("Session creation did not return an ID");
    }

    await step.run("send-prompt", async () => {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (authToken) {
        headers["Authorization"] = `Bearer ${authToken}`;
      }
      const res = await fetch(
        `${serverBaseUrl}/workspaces/${workspaceId}/sessions/${sessionId}/prompt_async`,
        {
          method: "POST",
          headers,
          body: JSON.stringify({ content: prompt }),
        },
      );
      if (!res.ok) {
        throw new Error(`Failed to send prompt: ${res.status}`);
      }
      return (await res.json()) as Record<string, unknown>;
    });

    return {
      automationId,
      automationName,
      sessionId,
      completedAt: new Date().toISOString(),
    };
  },
);

/** All Inngest functions to register with the serve handler. */
export const inngestFunctions = [runAutomation, scheduledAutomation];
