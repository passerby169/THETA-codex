import { thetaToolExecutors } from "./executors.js";
import { LocalToolRegistry, type HyphaCompatibleToolRegistry } from "./hypha-compatible.js";
import { thetaToolSpecs } from "./specs.js";
import type { ThetaToolId } from "./tool-ids.js";

export const registerThetaTools = <TRegistry extends HyphaCompatibleToolRegistry>(
  registry: TRegistry
): TRegistry => {
  for (const spec of thetaToolSpecs) {
    registry.register(spec, async (input, context) => {
      const executor = thetaToolExecutors[spec.id as ThetaToolId];
      if (!executor) {
        throw new Error(`No executor registered for THETA tool: ${spec.id}`);
      }

      return executor(input, context);
    });
  }

  return registry;
};

export const createThetaToolRegistry = (): LocalToolRegistry => registerThetaTools(new LocalToolRegistry());
