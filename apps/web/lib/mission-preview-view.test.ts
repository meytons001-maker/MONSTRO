import assert from "node:assert/strict";
import test from "node:test";
import { deriveMissionPreviewView } from "./mission-preview-view.ts";

test("projects an available mission preview", () => {
  assert.deepEqual(deriveMissionPreviewView(" /api/previews/task-1 "), {
    available: true,
    url: "/api/previews/task-1",
    label: "MISSION PREVIEW",
  });
});

test("projects a waiting preview when no runtime URL exists", () => {
  assert.deepEqual(deriveMissionPreviewView(), { available: false, label: "WAITING FOR BUILD" });
  assert.deepEqual(deriveMissionPreviewView("   "), { available: false, label: "WAITING FOR BUILD" });
});
