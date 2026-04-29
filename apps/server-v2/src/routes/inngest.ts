import type { Hono } from "hono";
import { serve } from "inngest/hono";
import { getRequestContext, type AppBindings } from "../context/request-context.js";
import { buildSuccessResponse, RouteError } from "../http.js";
import { inngest } from "../inngest/client.js";
import { inngestFunctions } from "../inngest/functions.js";
import type { InngestService } from "../inngest/service.js";
import { routePaths } from "./route-paths.js";

/**
 * Register Inngest serve endpoint + automation CRUD routes.
 *
 * The `/api/inngest` endpoint lets the Inngest dev server discover and invoke
 * our durable functions.  The `/workspaces/:id/automations/*` endpoints are the
 * REST surface the app uses to manage and trigger automations.
 */
export function registerInngestRoutes(
  app: Hono<AppBindings>,
  inngestService: InngestService,
) {
  // ── Inngest serve endpoint ────────────────────────────────────────────
  const inngestHandler = serve({
    client: inngest,
    functions: inngestFunctions,
  });

  // Hono route that delegates to Inngest's serve handler
  app.all("/api/inngest", async (c) => {
    const handler = inngestHandler as any;
    // inngest/hono returns { GET, POST, PUT } handlers
    const method = c.req.method.toUpperCase();

    if (method === "GET" && handler.GET) {
      return handler.GET(c);
    }
    if (method === "POST" && handler.POST) {
      return handler.POST(c);
    }
    if (method === "PUT" && handler.PUT) {
      return handler.PUT(c);
    }

    return c.json({ error: "Method not allowed" }, 405);
  });

  // ── Automation CRUD ───────────────────────────────────────────────────

  // List automations for a workspace
  app.get(routePaths.workspaces.automations.base(), (c) => {
    const { requestId } = getRequestContext(c);
    const workspaceId = c.req.param("workspaceId") ?? "";
    const items = inngestService.listAutomations(workspaceId);
    return c.json(buildSuccessResponse(requestId, { items }));
  });

  // Create a new automation
  app.post(routePaths.workspaces.automations.base(), async (c) => {
    const { requestId } = getRequestContext(c);
    const workspaceId = c.req.param("workspaceId") ?? "";
    const body = await c.req.json().catch(() => ({}));
    const automation = inngestService.createAutomation({
      name: body.name ?? "",
      description: body.description ?? "",
      prompt: body.prompt ?? "",
      schedule: body.schedule ?? "manual",
      workspaceId,
    });
    return c.json(buildSuccessResponse(requestId, automation), 201);
  });

  // Get a single automation
  app.get(routePaths.workspaces.automations.byId(), (c) => {
    const { requestId } = getRequestContext(c);
    const automationId = c.req.param("automationId") ?? "";
    const automation = inngestService.getAutomation(automationId);
    if (!automation) {
      throw new RouteError(404, "not_found", `Automation not found: ${automationId}`);
    }
    return c.json(buildSuccessResponse(requestId, automation));
  });

  // Delete an automation
  app.delete(routePaths.workspaces.automations.byId(), (c) => {
    const { requestId } = getRequestContext(c);
    const automationId = c.req.param("automationId") ?? "";
    inngestService.deleteAutomation(automationId);
    return c.json(buildSuccessResponse(requestId, { deleted: true }));
  });

  // Trigger / run an automation
  app.post(routePaths.workspaces.automations.trigger(), async (c) => {
    const { requestId } = getRequestContext(c);
    const automationId = c.req.param("automationId") ?? "";
    const result = await inngestService.triggerAutomation(automationId);
    return c.json(buildSuccessResponse(requestId, result));
  });
}
