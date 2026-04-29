import type { Hono } from "hono";
import type { AppDependencies } from "../context/app-dependencies.js";
import type { AppBindings } from "../context/request-context.js";
import { registerFileRoutes } from "./files.js";
import { registerInngestRoutes } from "./inngest.js";
import { registerManagedRoutes } from "./managed.js";
import { registerRuntimeRoutes } from "./runtime.js";
import { registerSessionRoutes } from "./sessions.js";
import { registerSystemRoutes } from "./system.js";
import { registerWorkspaceRoutes } from "./workspaces.js";
import type { InngestService } from "../inngest/service.js";

export function registerRoutes(
  app: Hono<AppBindings>,
  dependencies: AppDependencies,
  extras?: { inngest?: InngestService },
) {
  registerSystemRoutes(app, dependencies);
  registerRuntimeRoutes(app);
  registerWorkspaceRoutes(app);
  registerFileRoutes(app);
  registerManagedRoutes(app);
  registerSessionRoutes(app);

  if (extras?.inngest) {
    registerInngestRoutes(app, extras.inngest);
  }
}
