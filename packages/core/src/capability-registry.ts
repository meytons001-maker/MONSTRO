export type CapabilityAuthority = "read" | "write" | "execute" | "network";

export type CapabilityManifest = {
  id: string;
  version: string;
  description: string;
  tags: readonly string[];
  authorities: readonly CapabilityAuthority[];
};

export type CapabilityRequirement = {
  tags?: readonly string[];
  authorities?: readonly CapabilityAuthority[];
};

export type RegisteredCapability<T = unknown> = {
  manifest: CapabilityManifest;
  implementation: T;
};

function normalized(values: readonly string[] = []): string[] {
  return [...new Set(values.map((value) => value.trim().toLowerCase()).filter(Boolean))].sort();
}

function validateManifest(manifest: CapabilityManifest): CapabilityManifest {
  const id = manifest.id.trim();
  const version = manifest.version.trim();
  const description = manifest.description.trim();
  if (!id) throw new Error("Capability id is required");
  if (!version) throw new Error(`Capability ${id} version is required`);
  if (!description) throw new Error(`Capability ${id} description is required`);
  return { ...manifest, id, version, description, tags: normalized(manifest.tags), authorities: normalized(manifest.authorities) as CapabilityAuthority[] };
}

export class CapabilityRegistry {
  private readonly capabilities = new Map<string, RegisteredCapability>();

  register<T>(manifest: CapabilityManifest, implementation: T): RegisteredCapability<T> {
    const validated = validateManifest(manifest);
    if (this.capabilities.has(validated.id)) throw new Error(`Capability already registered: ${validated.id}`);
    const capability = { manifest: validated, implementation };
    this.capabilities.set(validated.id, capability);
    return capability;
  }

  get<T = unknown>(id: string): RegisteredCapability<T> | undefined {
    return this.capabilities.get(id.trim()) as RegisteredCapability<T> | undefined;
  }

  list(): RegisteredCapability[] {
    return [...this.capabilities.values()].sort((left, right) => left.manifest.id.localeCompare(right.manifest.id));
  }

  find(requirement: CapabilityRequirement = {}): RegisteredCapability[] {
    const tags = normalized(requirement.tags);
    const authorities = normalized(requirement.authorities) as CapabilityAuthority[];
    return this.list().filter(({ manifest }) =>
      tags.every((tag) => manifest.tags.includes(tag))
      && authorities.every((authority) => manifest.authorities.includes(authority)),
    );
  }

  require<T = unknown>(id: string, authorities: readonly CapabilityAuthority[] = []): RegisteredCapability<T> {
    const capability = this.get<T>(id);
    if (!capability) throw new Error(`Capability not registered: ${id}`);
    const missing = normalized(authorities).filter((authority) => !capability.manifest.authorities.includes(authority as CapabilityAuthority));
    if (missing.length) throw new Error(`Capability ${capability.manifest.id} lacks required authority: ${missing.join(", ")}`);
    return capability;
  }
}
