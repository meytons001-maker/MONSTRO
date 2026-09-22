import type { MissionResumePresentation } from "./mission-detail";
import { formatMissionResumeAction } from "./mission-detail";

export type MissionResumeState = {
  available: boolean;
  label: string;
  reason?: string;
};

export function deriveMissionResumeView(
  resume: (MissionResumePresentation & { reason?: string }) | undefined,
): MissionResumeState {
  if (!resume) return { available: false, label: "READ ONLY" };

  return {
    available: resume.resumable,
    label: formatMissionResumeAction(resume),
    reason: resume.reason,
  };
}
