import { Inngest } from "inngest";

/**
 * OpenWork Inngest client.
 *
 * Runs against the local Inngest Dev Server (port 8288) for self-hosted /
 * desktop-hosted setups. The INNGEST_DEV env var tells the SDK to connect to
 * the local dev server rather than Inngest Cloud.
 */
export const inngest = new Inngest({
  id: "openwork",
});
