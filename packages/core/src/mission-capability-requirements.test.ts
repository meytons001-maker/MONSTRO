import assert from "node:assert/strict";
import test from "node:test";
import type { MonstroTask } from "@monstro/contracts";
import { capabilityRequirement, missionCapabilityRequirements } from "./mission-capability-requirements.js";

function task(requestedCapabilities: MonstroTask["requestedCapabilities"]): Pick<MonstroTask, "requestedCapabilities"> {
  return { requestedCapabilities };
}

test("maps runtime capabilities to explicit registry tags and authorities", () => {
  assert.deepEqual(capabilityRequirement("filesystem.read"), {
    id: "filesystem.read",
    tags: ["filesystem"],
    authorities: ["read"],
    required: true,
  });
  assert.deepEqual(capabilityRequirement("network.public"), {
    id: "network.public",
    tags: ["public-network"],
    authorities: ["network"],
    required: true,
  });
  assert.deepEqual(capabilityRequirement("security.authorized-analysis"), {
    id: "security.authorized-analysis",
    tags: ["authorized-security"],
    authorities: ["read", "execute"],
    required: true,
  });
});

test("derives deterministic unique requirements from a mission", () => {
  const requirements = missionCapabilityRequirements(task([
    "process.execute",
    "filesystem.read",
    "process.execute",
    "filesystem.write",
  ]));
  assert.deepEqual(requirements.map(({ id }) => id), ["filesystem.read", "filesystem.write", "process.execute"]);
  assert.deepEqual(requirements.map(({ authorities }) => authorities), [["read"], ["write"], ["execute"]]);
});

test("does not silently grant network authority to local capabilities", () => {
  for (const capability of ["filesystem.read", "filesystem.write", "process.execute", "code.analyze"] as const) {
    assert.equal(capabilityRequirement(capability).authorities?.includes("network"), false);
  }
});
