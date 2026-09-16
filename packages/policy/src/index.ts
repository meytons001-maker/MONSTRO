import type { Capability, MonstroTask } from "@monstro/contracts";

export interface CapabilityDecision {
  allowed: Capability[];
  denied: Capability[];
  reasons: string[];
}

const BASE_CAPABILITIES = new Set<Capability>([
  "filesystem.read",
  "filesystem.write",
  "process.execute",
  "browser.navigate",
  "network.public",
  "media.transform",
  "code.analyze",
]);

export function evaluateCapabilities(task: MonstroTask): CapabilityDecision {
  const allowed: Capability[] = [];
  const denied: Capability[] = [];
  const reasons: string[] = [];

  for (const capability of task.requestedCapabilities) {
    if (BASE_CAPABILITIES.has(capability)) {
      allowed.push(capability);
      continue;
    }

    if (capability === "security.authorized-analysis") {
      allowed.push(capability);
      reasons.push("Security analysis requires an explicitly authorized target context at execution time.");
      continue;
    }

    denied.push(capability);
  }

  return { allowed, denied, reasons };
}
