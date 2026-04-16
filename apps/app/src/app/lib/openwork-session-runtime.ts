import {
  buildOpenworkWorkspaceBaseUrl,
  type OpenworkServerClient,
  type OpenworkServerSettings,
} from "./openwork-server";

export type OpenworkSessionRuntime = {
  workspaceId: string;
  opencodeBaseUrl: string;
  openworkToken: string;
};

type ResolveOpenworkSessionRuntimeOptions = {
  workspaceId?: string | null;
  client?: OpenworkServerClient | null;
  settings?: Pick<OpenworkServerSettings, "token"> | null;
};

export function resolveOpenworkSessionRuntime(
  options: ResolveOpenworkSessionRuntimeOptions,
): OpenworkSessionRuntime | null {
  const workspaceId = options.workspaceId?.trim() ?? "";
  const baseUrl = options.client?.baseUrl?.trim() ?? "";
  const openworkToken =
    options.client?.token?.trim() || options.settings?.token?.trim() || "";

  if (!workspaceId || !baseUrl || !openworkToken) {
    return null;
  }

  const mountedBaseUrl = buildOpenworkWorkspaceBaseUrl(baseUrl, workspaceId) ?? baseUrl;
  const opencodeBaseUrl = `${mountedBaseUrl.replace(/\/+$/, "")}/opencode`;
  if (!opencodeBaseUrl) return null;

  return {
    workspaceId,
    opencodeBaseUrl,
    openworkToken,
  };
}
