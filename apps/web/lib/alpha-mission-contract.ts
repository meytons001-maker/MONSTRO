import type { MonstroTask } from "@monstro/contracts";

export interface AlphaMissionResult {
  taskId: string;
  phase: MonstroTask["phase"];
  iteration: number;
  summary: string;
  artifact: string;
}

export interface AlphaMissionError {
  error: string;
}
