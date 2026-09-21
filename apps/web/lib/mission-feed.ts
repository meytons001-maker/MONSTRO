import type { MissionTransportEvent } from "@monstro/contracts";

export type MissionFeedItem = {
  id: string;
  phase: string;
  event: string;
  detail?: string;
};

export function deriveMissionFeed(events: readonly MissionTransportEvent[], limit = 4): MissionFeedItem[] {
  const size = Math.max(0, Math.trunc(limit));
  if (size === 0) return [];
  return events.slice(-size).map((event) => ({
    id: event.id,
    phase: event.phase.toUpperCase(),
    event: event.type,
    detail: event.detail?.trim() || undefined,
  }));
}
