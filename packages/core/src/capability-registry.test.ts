import assert from "node:assert/strict";
import test from "node:test";
import { CapabilityRegistry } from "./capability-registry.ts";

const research = {
  id: "research.web",
  version: "1.0.0",
  description: "Read authorized public web sources",
  tags: ["Research", "Web", "research"],
  authorities: ["read", "network"] as const,
};

const builder = {
  id: "software.builder",
  version: "1.0.0",
  description: "Build inside an authorized mission workspace",
  tags: ["software", "build"],
  authorities: ["read", "write", "execute"] as const,
};

test("registers normalized manifests and returns deterministic listings", () => {
  const registry = new CapabilityRegistry();
  registry.register(builder, { kind: "builder" });
  registry.register(research, { kind: "research" });
  assert.deepEqual(registry.list().map(({ manifest }) => manifest.id), ["research.web", "software.builder"]);
  assert.deepEqual(registry.get("research.web")?.manifest.tags, ["research", "web"]);
});

test("discovers capabilities by tags and minimum authorities", () => {
  const registry = new CapabilityRegistry();
  registry.register(research, {});
  registry.register(builder, {});
  assert.deepEqual(registry.find({ tags: ["research"], authorities: ["network"] }).map(({ manifest }) => manifest.id), ["research.web"]);
  assert.deepEqual(registry.find({ authorities: ["execute"] }).map(({ manifest }) => manifest.id), ["software.builder"]);
});

test("requires explicit registered authority instead of escalating privileges", () => {
  const registry = new CapabilityRegistry();
  registry.register(research, {});
  assert.equal(registry.require("research.web", ["read", "network"]).manifest.id, "research.web");
  assert.throws(() => registry.require("research.web", ["write"]), /lacks required authority: write/);
  assert.throws(() => registry.require("missing"), /not registered/);
});

test("rejects duplicate or invalid capability manifests", () => {
  const registry = new CapabilityRegistry();
  registry.register(research, {});
  assert.throws(() => registry.register(research, {}), /already registered/);
  assert.throws(() => registry.register({ ...research, id: " " }, {}), /id is required/);
});
