import { CapabilityRegistry, type CapabilityAuthority, type RegisteredCapability } from "./capability-registry.js";

export type MissionCapabilityRequirement = {
  id: string;
  tags: readonly string[];
  authorities?: readonly CapabilityAuthority[];
  required?: boolean;
};

export type MissionCapabilityResolution = {
  requirement: MissionCapabilityRequirement;
  capability?: RegisteredCapability;
};

export type MissionCapabilityResolutionSet = {
  resolved: MissionCapabilityResolution[];
  missing: MissionCapabilityRequirement[];
};

function normalizeRequirement(requirement: MissionCapabilityRequirement): MissionCapabilityRequirement {
  const id = requirement.id.trim();
  if (!id) throw new Error("Mission capability requirement id is required");
  const tags = [...new Set(requirement.tags.map((tag) => tag.trim().toLowerCase()).filter(Boolean))].sort();
  if (!tags.length) throw new Error(`Mission capability requirement ${id} needs at least one tag`);
  const authorities = [...new Set((requirement.authorities ?? []).map((authority) => authority.trim().toLowerCase() as CapabilityAuthority))].sort() as CapabilityAuthority[];
  return { id, tags, authorities, required: requirement.required ?? true };
}

export class MissionCapabilityResolver {
  constructor(private readonly registry: CapabilityRegistry) {}

  resolve(requirements: readonly MissionCapabilityRequirement[]): MissionCapabilityResolutionSet {
    const ids = new Set<string>();
    const resolved: MissionCapabilityResolution[] = [];
    const missing: MissionCapabilityRequirement[] = [];

    for (const source of requirements) {
      const requirement = normalizeRequirement(source);
      if (ids.has(requirement.id)) throw new Error(`Duplicate mission capability requirement: ${requirement.id}`);
      ids.add(requirement.id);
      const capability = this.registry.find({ tags: requirement.tags, authorities: requirement.authorities })[0];
      resolved.push({ requirement, capability });
      if (!capability && requirement.required) missing.push(requirement);
    }

    return { resolved, missing };
  }

  require(requirements: readonly MissionCapabilityRequirement[]): RegisteredCapability[] {
    const resolution = this.resolve(requirements);
    if (resolution.missing.length) {
      throw new Error(`Missing required mission capabilities: ${resolution.missing.map(({ id }) => id).join(", ")}`);
    }
    return resolution.resolved.flatMap(({ capability }) => capability ? [capability] : []);
  }
}
