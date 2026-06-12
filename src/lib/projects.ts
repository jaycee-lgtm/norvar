export type ProjectFolder = {
  id:          string;
  name:        string;
  description: string | null;
  color:       string;
  created_at:  string;
  updated_at?: string;
};

export const PROJECT_COLORS = [
  "#8b1a1a",
  "#1a4d8b",
  "#1a6b3c",
  "#6b4f1a",
  "#4a1a6b",
  "#1a6b6b",
];

export function projectCounts(folder: {
  assessment_count?: number;
  document_count?: number;
  gap_count?: number;
  chat_count?: number;
}) {
  return (folder.assessment_count ?? 0)
    + (folder.document_count ?? 0)
    + (folder.gap_count ?? 0)
    + (folder.chat_count ?? 0);
}

export function fmtProjectDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric", month: "short", year: "numeric",
  });
}
