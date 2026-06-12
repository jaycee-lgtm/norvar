import { createClient } from "@supabase/supabase-js";
import { searchOrgMembers } from "@/lib/clerk-org";
import { mergeOrgAssigneeRoles, type OrgAssigneeRoles } from "@/lib/org-assignee-roles";
import type { AssigneeMeta } from "@/lib/escalation";

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
  if (Object.keys(roles).length > 0) return roles;

  return importAssigneeRolesFromItems(orgId);
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

  await syncAssigneeRolesToItems(next);
  return next;
}

async function importAssigneeRolesFromItems(orgId: string): Promise<OrgAssigneeRoles> {
  const members = await searchOrgMembers(orgId, "", 100);
  const memberIds = new Set(members.map(m => m.id));
  if (memberIds.size === 0) return {};

  const { data: items } = await supabase
    .from("remediation_items")
    .select("assignee_meta")
    .order("updated_at", { ascending: false })
    .limit(500);

  const imported: OrgAssigneeRoles = {};
  for (const item of items ?? []) {
    const meta = (item.assignee_meta ?? {}) as AssigneeMeta;
    for (const [userId, entry] of Object.entries(meta)) {
      if (!memberIds.has(userId) || imported[userId]) continue;
      const role = entry?.role?.trim();
      if (role) imported[userId] = role;
    }
  }

  if (Object.keys(imported).length === 0) return {};

  await supabase
    .from("org_assignee_roles")
    .upsert(
      { org_id: orgId, roles: imported, updated_at: new Date().toISOString() },
      { onConflict: "org_id" },
    );

  return imported;
}

async function syncAssigneeRolesToItems(roles: OrgAssigneeRoles) {
  for (const [userId, role] of Object.entries(roles)) {
    const { data: items } = await supabase
      .from("remediation_items")
      .select("id, assignee_meta, assigned_to")
      .contains("assigned_to", [userId]);

    for (const item of items ?? []) {
      const assigned = item.assigned_to ?? [];
      if (!assigned.includes(userId)) continue;

      const meta = { ...((item.assignee_meta ?? {}) as AssigneeMeta) };
      if (!meta[userId]) {
        meta[userId] = { role, since: new Date().toISOString() };
      } else {
        meta[userId] = { ...meta[userId], role };
      }

      await supabase
        .from("remediation_items")
        .update({ assignee_meta: meta })
        .eq("id", item.id);
    }
  }
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
