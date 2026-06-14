import { searchOrgMembers } from "@/lib/clerk-org";

export type RemediationAccessRow = {
  created_by:  string;
  assigned_to: string[] | null;
};

export async function getOrgMemberIds(orgId: string | null): Promise<Set<string> | null> {
  if (!orgId) return null;
  const members = await searchOrgMembers(orgId, "", 100);
  return new Set(members.map(m => m.id));
}

/** Whether the signed-in user may view a remediation row (org queue or direct assignment). */
export function canViewRemediationItem(
  item: RemediationAccessRow,
  userId: string,
  orgMemberIds: Set<string> | null,
): boolean {
  if (item.created_by === userId || (item.assigned_to ?? []).includes(userId)) return true;
  if (!orgMemberIds || !orgMemberIds.has(userId)) return false;
  if (orgMemberIds.has(item.created_by)) return true;
  return (item.assigned_to ?? []).some(id => orgMemberIds.has(id));
}

export function isMineRemediationItem(item: RemediationAccessRow, userId: string): boolean {
  return item.created_by === userId || (item.assigned_to ?? []).includes(userId);
}
