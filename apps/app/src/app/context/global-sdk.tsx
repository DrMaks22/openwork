import { createOpencodeClient, type Event } from "@opencode-ai/sdk/v2/client";
import { createGlobalEmitter } from "@solid-primitives/event-bus";
import {
  batch,
  createContext,
  createEffect,
  createSignal,
  onCleanup,
  useContext,
  type ParentProps,
} from "solid-js";

import { createBufferedGlobalEventRelay } from "../lib/global-event-relay";
import { usePlatform } from "./platform";
import { useServer } from "./server";

export type GlobalSDKContextValue = {
  url: () => string;
  client: () => ReturnType<typeof createOpencodeClient>;
  event: ReturnType<typeof createGlobalEmitter<{ [key: string]: Event }>>;
};

const GlobalSDKContext = createContext<GlobalSDKContextValue | undefined>(undefined);

export function GlobalSDKValueProvider(
  props: ParentProps & { value: GlobalSDKContextValue },
) {
  return (
    <GlobalSDKContext.Provider value={props.value}>
      {props.children}
    </GlobalSDKContext.Provider>
  );
}

export function GlobalSDKProvider(props: ParentProps) {
  const server = useServer();
  const platform = usePlatform();
  const emitter = createGlobalEmitter<{ [key: string]: Event }>();
  const [client, setClient] = createSignal(
    createOpencodeClient({
      baseUrl: server.url,
      fetch: platform.fetch,
      throwOnError: true,
    }),
  );
  const [url, setUrl] = createSignal(server.url);

  createEffect(() => {
    const baseUrl = server.url;
    const isHealthy = server.healthy() === true;

    const token = (() => {
      if (typeof window === "undefined") return "";
      try {
        return (window.localStorage.getItem("openwork.server.token") ?? "").trim();
      } catch {
        return "";
      }
    })();
    const headers = token && baseUrl.includes("/opencode") ? { Authorization: `Bearer ${token}` } : undefined;
    setUrl(baseUrl);

    // Always keep the request client in sync with the active URL.
    setClient(
      createOpencodeClient({
        baseUrl,
        headers,
        fetch: platform.fetch,
        throwOnError: true,
      }),
    );

    // Avoid silent retry loops (SSE reconnects) when the dependency is unavailable.
    if (!baseUrl || !isHealthy) {
      return;
    }

    const abort = new AbortController();
    const eventClient = createOpencodeClient({
      baseUrl,
      headers,
      signal: abort.signal,
      fetch: platform.fetch,
    });
    const relay = createBufferedGlobalEventRelay((directory, payload) => {
      batch(() => {
        emitter.emit(directory, payload);
      });
    });

    void (async () => {
      const subscription = await eventClient.event.subscribe(undefined, { signal: abort.signal });
      let yielded = Date.now();

      for await (const event of subscription.stream as AsyncIterable<unknown>) {
        const record = event as Event & { directory?: string; payload?: Event };
        const payload = record.payload ?? record;
        if (!payload?.type) continue;

        const directory = typeof record.directory === "string" ? record.directory : "global";
        relay.push(directory, payload);

        if (Date.now() - yielded < 8) continue;
        yielded = Date.now();
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
      }
    })()
      .finally(() => relay.stop())
      .catch(() => undefined);

    onCleanup(() => {
      abort.abort();
      relay.stop();
    });
  });

  const value: GlobalSDKContextValue = {
    url,
    client,
    event: emitter,
  };

  return <GlobalSDKValueProvider value={value}>{props.children}</GlobalSDKValueProvider>;
}

export function useGlobalSDK() {
  const context = useContext(GlobalSDKContext);
  if (!context) {
    throw new Error("Global SDK context is missing");
  }
  return context;
}
