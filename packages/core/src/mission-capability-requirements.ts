import type { Capability, MonstroTask } from "@monstro/contracts";
import type { CapabilityAuthority } from "./capability-registry.js";
import type { MissionCapabilityRequirement } from "./mission-capability-resolver.js";

type CapabilityPolicy = {
  tags: readonly string[];
  authorities: readonly CapabilityAuthority[];
};

const CAPABILITY_POLICIES: Record<Capability, CapabilityPolicy> = {
  "filesystem.read": { tags: ["filesystem"], authorities: ["read"] },
  "filesystem.write": { tags: ["filesystem"], authorities: ["write"] },
  "process.execute": { tags: ["process"], authorities: ["execute"] },
  "browser.navigate": { tags: ["browser"], authorities: ["network"] },
  "network.public": { tags: ["public-network"], authorities: ["network"] },
  "media.transform": { tags: ["media"], authorities: ["read", "write", "execute"] },
  "code.analyze": { tags: ["code-analysis"], authorities: ["read"] },
  "security.authorized-analysis": { tags: ["authorized-security"], authorities: ["read", "execute"] },
};

export function capabilityRequirement(capability: Capability): MissionCapabilityRequirement {
  const policy = CAPABILITY_POLICIES[capability];
  return {
    id: capability,
    tags: policy.tags,
    authorities: policy.authorities,
    required: true,
  };
}

export function missionCapabilityRequirements(task: Pick<MonstroTask, "requestedCapabilities">): MissionCapabilityRequirement[] {
  return [...new Set(task.requestedCapabilities)].sort().map(capabilityRequirement);
}
