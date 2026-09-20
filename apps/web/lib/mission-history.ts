export type MissionHistoryItem = {
  taskId: string;
  phase: string | null;
  status: string | null;
  updatedAt: string | null;
  eventCount: number;
  resumable: boolean;
  restartPhase: string | null;
  resumeReason: string;
};

export function parseMissionHistoryPayload(payload: unknown): MissionHistoryItem[] {
  if (!payload || typeof payload !== "object" || !("missions" in payload) || !Array.isArray(payload.missions)) {
    throw new Error("Mission history response is invalid");
  }

  return payload.missions.filter((mission): mission is MissionHistoryItem => {
    if (!mission || typeof mission !== "object") return false;
    const candidate = mission as Partial<MissionHistoryItem>;
    return typeof candidate.taskId === "string" && candidate.taskId.length > 0
      && (candidate.phase === null || typeof candidate.phase === "string")
      && (candidate.status === null || typeof candidate.status === "string")
      && (candidate.updatedAt === null || typeof candidate.updatedAt === "string")
      && typeof candidate.eventCount === "number"
      && typeof candidate.resumable === "boolean"
      && (candidate.restartPhase === null || typeof candidate.restartPhase === "string")
      && typeof candidate.resumeReason === "string";
  });
}

export function formatMissionResumeAction(mission: MissionHistoryItem) {
  if (!mission.resumable) return "READ ONLY";
  if (mission.restartPhase === "inspect") return "REBUILD FROM INSPECT";
  return `RESUME ${mission.restartPhase?.toUpperCase() ?? "SAFE"}`;
}

export function formatMissionHistoryLabel(mission: MissionHistoryItem) {
  const phase = (mission.phase || "unknown").toUpperCase();
  const date = mission.updatedAt ? new Date(mission.updatedAt) : null;
  const timestamp = date && !Number.isNaN(date.getTime()) ? date.toLocaleString() : "unknown time";
  return `${formatMissionResumeAction(mission)} · ${phase} · ${mission.eventCount} events · ${timestamp} · ${mission.taskId}`;
}
