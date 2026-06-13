import { createClient } from "@supabase/supabase-js";
import { searchOrgMembers } from "@/lib/clerk-org";
import { mergeOrgAssigneeRoles, type OrgAssigneeRoles } from "@/lib/org-assignee-roles";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export async function getOrgAssigneeRoles(orgId: string): Promise<OrgAssigneeRoles> {
  const { data, error } = await supabase
    .from("org_assignee_roles")
    .select("roles")
    .eq("org_id", orgId)
    .maybeSingle();

  if (error?.message?.includes("org_assignee_roles")) {
    throw new Error("Gap owner roles are not configured yet. Run SETUP_ORG_ASSIGNEE_ROLES.sql in Supabase.");
  }
  if (error || !data) return {};

  const roles = mergeOrgAssigneeRoles(data.roles);
  return roles;
}

export async function updateOrgAssigneeRoles(
  orgId: string,
  roles: OrgAssigneeRoles,
): Promise<OrgAssigneeRoles> {
  const members = await searchOrgMembers(orgId, "", 100);
  const memberIds = new Set(members.map(m => m.id));
  const next: OrgAssigneeRoles = {};

  for (const [userId, role] of Object.entries(roles)) {
    if (!memberIds.has(userId)) continue;
    const trimmed = role.trim();
    if (trimmed) next[userId] = trimmed;
  }

  const { error } = await supabase
    .from("org_assignee_roles")
    .upsert(
      { org_id: orgId, roles: next, updated_at: new Date().toISOString() },
      { onConflict: "org_id" },
    );

  if (error) throw new Error(error.message);

  return next;
}

export async function rolesForAssignees(
  orgId: string | null,
  userIds: string[],
): Promise<Record<string, string>> {
  if (!orgId || userIds.length === 0) return {};

  const defaults = await getOrgAssigneeRoles(orgId);
  const roles: Record<string, string> = {};
  for (const id of userIds) {
    if (defaults[id]) roles[id] = defaults[id];
  }
  return roles;
}
