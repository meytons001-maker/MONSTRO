import type { MonstroTask } from "@monstro/contracts";
import { evaluateCapabilities } from "@monstro/policy";
import type { Authorizer, CapabilityAuthorization } from "./index.js";

export class PolicyAuthorizer implements Authorizer {
  authorize(task: MonstroTask): CapabilityAuthorization {
    return evaluateCapabilities(task);
  }
}
