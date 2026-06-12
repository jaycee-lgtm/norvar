export type OrgAssigneeRoles = Record<string, string>;

export function mergeOrgAssigneeRoles(raw: unknown): OrgAssigneeRoles {
  if (!raw || typeof raw !== "object") return {};
  const input = raw as Record<string, unknown>;
  const next: OrgAssigneeRoles = {};
  for (const [userId, role] of Object.entries(input)) {
    if (typeof role === "string" && role.trim()) next[userId] = role.trim();
  }
  return next;
}

export async function fetchOrgAssigneeRoles(): Promise<OrgAssigneeRoles> {
  const res = await fetch("/api/org/assignee-roles");
  if (!res.ok) return {};
  const data = await res.json() as { roles?: unknown };
  return mergeOrgAssigneeRoles(data.roles);
}

export async function saveOrgAssigneeRoles(
  roles: OrgAssigneeRoles,
): Promise<OrgAssigneeRoles> {
  const res = await fetch("/api/org/assignee-roles", {
    method:  "PATCH",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ roles }),
  });
  const data = await res.json() as { roles?: unknown; error?: string };
  if (!res.ok) throw new Error(data.error || "Could not save gap owner roles");
  return mergeOrgAssigneeRoles(data.roles);
}
