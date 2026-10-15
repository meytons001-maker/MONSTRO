import type { AlphaMissionError, AlphaMissionResult } from "./alpha-mission-contract";

type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

export async function requestAlphaMission(
  intent: string,
  fetcher: FetchLike = fetch,
): Promise<AlphaMissionResult> {
  const response = await fetcher("/api/alpha/mission", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ intent }),
  });

  const payload = await response.json() as AlphaMissionResult | AlphaMissionError;
  if (!response.ok) {
    throw new Error("error" in payload ? payload.error : "Mission execution failed.");
  }
  if (!("taskId" in payload)) throw new Error("Mission returned an invalid response.");
  return payload;
}
