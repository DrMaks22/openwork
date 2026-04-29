import { Hono } from "hono";
import type { AppDependencies } from "./context/app-dependencies.js";
import { createAppDependencies } from "./context/app-dependencies.js";
import type { AppBindings } from "./context/request-context.js";
import { requestContextMiddleware } from "./context/request-context.js";
import { buildErrorResponse } from "./http.js";
import { createInngestService, type InngestService } from "./inngest/service.js";
import { errorHandlingMiddleware } from "./middleware/error-handler.js";
import { requestLoggerMiddleware } from "./middleware/request-logger.js";
import { requestIdMiddleware } from "./middleware/request-id.js";
import { responseFinalizerMiddleware } from "./middleware/response-finalizer.js";
import { registerRoutes } from "./routes/index.js";

export type CreateAppOptions = {
  dependencies?: AppDependencies;
  inngest?: {
    /** Override the base URL that Inngest functions use to call back into the server. */
    serverBaseUrl?: string;
    authToken?: string;
  };
};

export function createApp(options: CreateAppOptions = {}) {
  const dependencies = options.dependencies ?? createAppDependencies();
  const app = new Hono<AppBindings>();

  app.use("*", requestIdMiddleware);
  app.use("*", requestContextMiddleware(dependencies));
  app.use("*", responseFinalizerMiddleware);
  app.use("*", requestLoggerMiddleware);
  app.use("*", errorHandlingMiddleware);

  // Create Inngest service for automation workflows
  const serverBaseUrl = options.inngest?.serverBaseUrl
    ?? process.env.OPENWORK_SERVER_BASE_URL
    ?? "http://localhost:48101";
  const inngestService: InngestService = createInngestService({
    serverBaseUrl,
    authToken: options.inngest?.authToken ?? process.env.OPENWORK_TOKEN,
    sessions: dependencies.services.sessions,
  });

  registerRoutes(app, dependencies, { inngest: inngestService });

  app.notFound((c) => {
    const requestId = c.get("requestId");
    return c.json(
      buildErrorResponse({
        requestId,
        code: "not_found",
        message: `Route not found: ${new URL(c.req.url).pathname}`,
      }),
      404,
    );
  });

  return app;
}

export type AppType = ReturnType<typeof createApp>;
