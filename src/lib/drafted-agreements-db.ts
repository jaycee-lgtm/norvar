/** Columns that exist on the base drafted_agreements migration (without followups). */
export const DRAFTED_AGREEMENT_SELECT =
  "id, agent, agreement_type, governing_law, result, document_id, folder_id, created_at";

export type DraftedAgreementRow = {
  id:             string;
  agent:          "cassius" | "nora";
  agreement_type: string | null;
  governing_law:  string | null;
  result:         unknown;
  document_id:    string | null;
  folder_id:      string | null;
  created_at:     string;
  followups?:     Record<string, unknown>;
};

export function normalizeDraftRow(row: DraftedAgreementRow): DraftedAgreementRow {
  const followups = row.followups;
  return {
    ...row,
    followups: followups && typeof followups === "object" ? followups : {},
  };
}

export type DraftInsertPayload = {
  user_id:        string;
  agent:          "cassius" | "nora";
  agreement_type: string;
  governing_law:  string | null;
  result:         unknown;
  created_at?:    string;
};

export function buildDraftInsertRow(payload: DraftInsertPayload) {
  return {
    ...payload,
    created_at: payload.created_at ?? new Date().toISOString(),
  };
}
