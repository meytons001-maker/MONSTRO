export type MissionPreviewView = {
  available: boolean;
  url?: string;
  label: "MISSION PREVIEW" | "WAITING FOR BUILD";
};

export function deriveMissionPreviewView(previewUrl?: string): MissionPreviewView {
  const url = previewUrl?.trim();
  return url
    ? { available: true, url, label: "MISSION PREVIEW" }
    : { available: false, label: "WAITING FOR BUILD" };
}
