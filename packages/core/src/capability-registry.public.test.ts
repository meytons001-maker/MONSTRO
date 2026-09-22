import assert from "node:assert/strict";
import test from "node:test";
import { CapabilityRegistry, type CapabilityManifest, type CapabilityRequirement } from "./index.ts";

const manifest: CapabilityManifest = {
  id: "research.public-web",
  version: "1.0.0",
  description: "Research authorized public sources",
  tags: ["research", "public-web"],
  authorities: ["read", "network"],
};

test("capability registry is consumable through the @monstro/core public boundary", () => {
  const registry = new CapabilityRegistry();
  registry.register(manifest, { execute: async () => [] });
  const requirement: CapabilityRequirement = { tags: ["research"], authorities: ["read", "network"] };
  assert.deepEqual(registry.find(requirement).map(({ manifest }) => manifest.id), ["research.public-web"]);
});
