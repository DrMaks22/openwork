import { useEffect, useRef } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { Orbit } from "lucide-react";

import { deepLinkBridgeEvent } from "../../app/lib/deep-link-bridge";
import { readOpenworkConnectInviteFromSearch } from "../../app/lib/openwork-server";
import { useOpenworkStore } from "../kernel/store";
import { WorkspaceSessionSidebar } from "./workspace-session-sidebar";
import { SettingsScreen } from "../domains/settings/settings-screen";
import { ChatPanel } from "../domains/session/chat/chat-panel";
import { CreateWorkspaceDialog } from "../domains/workspace/create-workspace-dialog";

function Shell() {
  const bootstrappedRef = useRef(false);
  const bootstrapping = useOpenworkStore((state) => state.bootstrapping);
  const server = useOpenworkStore((state) => state.server);
  const connectToServer = useOpenworkStore((state) => state.connectToServer);
  const bootstrap = useOpenworkStore((state) => state.bootstrap);

  useEffect(() => {
    if (bootstrappedRef.current) return;
    bootstrappedRef.current = true;
    void bootstrap();
  }, [bootstrap]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handleDeepLink = (event: Event) => {
      const custom = event as CustomEvent<{ urls?: string[] }>;
      const candidate = custom.detail?.urls?.[0];
      if (!candidate) return;

      try {
        const invite = readOpenworkConnectInviteFromSearch(new URL(candidate).searchParams);
        if (!invite?.url) return;
        void connectToServer({ url: invite.url, token: invite.token });
      } catch {
        // ignore
      }
    };

    window.addEventListener(deepLinkBridgeEvent, handleDeepLink as EventListener);
    return () => window.removeEventListener(deepLinkBridgeEvent, handleDeepLink as EventListener);
  }, [connectToServer]);

  if (bootstrapping && !server.url) {
    return (
      <div className="flex min-h-screen items-center justify-center px-6 py-16">
        <div className="ow-soft-shell max-w-xl px-8 py-10 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-slate-100 text-slate-700">
            <Orbit className="h-7 w-7 animate-[spin_12s_linear_infinite]" />
          </div>
          <h1 className="text-2xl font-semibold text-slate-900">Preparing the React shell</h1>
          <p className="mt-3 text-sm leading-7 text-slate-600">
            OpenWork is hydrating the server URL, token, workspace registry, and event stream bridge.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="ow-page-shell">
      <div className="ow-shell-grid">
        <WorkspaceSessionSidebar />
        <main className="min-w-0">
          <Routes>
            <Route path="/session" element={<ChatPanel />} />
            <Route path="/session/:sessionId" element={<ChatPanel />} />
            <Route path="/settings" element={<SettingsScreen />} />
            <Route path="*" element={<Navigate replace to={server.url ? "/session" : "/settings"} />} />
          </Routes>
        </main>
      </div>

      <CreateWorkspaceDialog />
    </div>
  );
}

export function AppRoot() {
  return <Shell />;
}
