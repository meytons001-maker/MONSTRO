import type { MissionTransportEvent } from "@monstro/contracts";

export type MissionProgress = NonNullable<NonNullable<MissionTransportEvent["data"]>["progress"]>;

export type MissionTraceMetric = {
  key: "build" | "evaluate" | "repair" | "requirements";
  label: "BUILD" | "EVALUATE" | "REPAIR" | "REQUIREMENTS";
  value: string;
  detail: string;
};

export type MissionTraceSummary = {
  metrics: MissionTraceMetric[];
};

export function deriveMissionTraceSummary(progress: MissionProgress | undefined): MissionTraceSummary | undefined {
  if (!progress) return undefined;

  const latestBuild = progress.build.at(-1);
  const latestEvaluation = progress.evaluations.at(-1);
  const latestRepair = progress.repairs.at(-1);
  const requirementIds = new Set([
    ...progress.build.flatMap((item) => item.requirementIds),
    ...progress.evaluations.flatMap((item) => item.requirementIds),
  ]);

  return {
    metrics: [
      { key: "build", label: "BUILD", value: String(progress.build.length), detail: latestBuild?.path ?? "—" },
      {
        key: "evaluate",
        label: "EVALUATE",
        value: latestEvaluation ? String(latestEvaluation.score) : "—",
        detail: latestEvaluation?.accepted ? "ACCEPTED" : latestEvaluation ? "REVIEW" : "WAITING",
      },
      { key: "repair", label: "REPAIR", value: String(progress.repairs.length), detail: latestRepair?.path ?? "—" },
      {
        key: "requirements",
        label: "REQUIREMENTS",
        value: String(requirementIds.size),
        detail: latestEvaluation?.findingCodes.join(", ") || "TRACKED",
      },
    ],
  };
}
