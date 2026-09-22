import assert from "node:assert/strict";
import test from "node:test";
import { CapabilityRegistry, MissionCapabilityResolver } from "./index.js";

function registry() {
  const capabilities = new CapabilityRegistry();
  capabilities.register({ id: "public-research", version: "1.0.0", description: "Read public sources", tags: ["research", "public-information"], authorities: ["read", "network"] }, { kind: "research" });
  capabilities.register({ id: "workspace-builder", version: "1.0.0", description: "Build inside an authorized workspace", tags: ["software", "workspace"], authorities: ["read", "write", "execute"] }, { kind: "builder" });
  return capabilities;
}

test("resolves mission requirements only through capabilities with sufficient authority", () => {
  const resolver = new MissionCapabilityResolver(registry());
  const resolution = resolver.resolve([{ id: "research-market", tags: ["research"], authorities: ["read", "network"] }]);
  assert.equal(resolution.missing.length, 0);
  assert.equal(resolution.resolved[0]?.capability?.manifest.id, "public-research");
});

test("does not escalate authority when a matching capability lacks permission", () => {
  const resolver = new MissionCapabilityResolver(registry());
  const resolution = resolver.resolve([{ id: "research-write", tags: ["research"], authorities: ["write"] }]);
  assert.deepEqual(resolution.resolved.map(({ capability }) => capability?.manifest.id), [undefined]);
  assert.deepEqual(resolution.missing.map(({ id }) => id), ["research-write"]);
  assert.throws(() => resolver.require([{ id: "research-write", tags: ["research"], authorities: ["write"] }]), /Missing required mission capabilities: research-write/);
});

test("optional requirements can remain unresolved without blocking the mission", () => {
  const resolver = new MissionCapabilityResolver(registry());
  const selected = resolver.require([
    { id: "build", tags: ["software"], authorities: ["write", "execute"] },
    { id: "voice", tags: ["voice"], authorities: ["execute"], required: false },
  ]);
  assert.deepEqual(selected.map(({ manifest }) => manifest.id), ["workspace-builder"]);
});

test("normalizes requirements and rejects ambiguous duplicate ids", () => {
  const resolver = new MissionCapabilityResolver(registry());
  const resolution = resolver.resolve([{ id: " market ", tags: [" Research ", "research"], authorities: ["network", "network"] }]);
  assert.deepEqual(resolution.resolved[0]?.requirement, { id: "market", tags: ["research"], authorities: ["network"], required: true });
  assert.throws(() => resolver.resolve([{ id: "same", tags: ["research"] }, { id: "same", tags: ["software"] }]), /Duplicate mission capability requirement: same/);
  assert.throws(() => resolver.resolve([{ id: "empty", tags: [] }]), /needs at least one tag/);
});
