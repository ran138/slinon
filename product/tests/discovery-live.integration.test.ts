import { describe, expect, it } from "vitest";
import { createDiscoveryConnectors } from "../lib/ingestion/discovery/connectors";

const runLive = process.env.RUN_LIVE_DISCOVERY === "1";

describe.skipIf(!runLive)("live discovery endpoints", () => {
  for (const connector of createDiscoveryConnectors({ timeoutMs: 30_000 })) {
    it(`${connector.source} responds without corrupting the candidate contract`, async () => {
      const discovery = connector.discover({
        since: new Date(Date.now() - 7 * 24 * 60 * 60 * 1_000),
        limit: 5,
      });
      if (connector.source === "calcalist" || connector.source === "reuters") {
        await expect(discovery).rejects.toThrow(/authorized|licensed/i);
        return;
      }
      const candidates = await discovery;
      expect(candidates.length).toBeGreaterThan(0);
      expect(candidates.every((candidate) => candidate.source === connector.source)).toBe(true);
      expect(candidates.every((candidate) => candidate.canonicalUrl.startsWith("https://"))).toBe(true);
    }, 45_000);
  }
});
