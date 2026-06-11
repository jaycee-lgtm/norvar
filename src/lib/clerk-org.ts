import { clerkClient } from "@clerk/nextjs/server";
import type { UserProfile } from "@/lib/clerk-users";

export type OrgSummary = { id: string; name: string };

export async function getActiveOrganizationId(
  userId: string,
  sessionOrgId: string | null | undefined,
): Promise<string | null> {
  if (sessionOrgId) return sessionOrgId;

  const client = await clerkClient();
  const { data } = await client.users.getOrganizationMembershipList({ userId, limit: 10 });
  return data[0]?.organization.id ?? null;
}

export async function getOrganizationSummary(orgId: string): Promise<OrgSummary | null> {
  try {
    const client = await clerkClient();
    const org = await client.organizations.getOrganization({ organizationId: orgId });
    return { id: org.id, name: org.name };
  } catch {
    return null;
  }
}

function membershipToProfile(m: {
  publicUserData?: {
    userId: string;
    identifier: string;
    firstName: string | null;
    lastName: string | null;
  } | null;
}): UserProfile | null {
  const u = m.publicUserData;
  if (!u?.userId) return null;
  const email = u.identifier ?? "";
  const name  = [u.firstName, u.lastName].filter(Boolean).join(" ")
    || email.split("@")[0]
    || "Unknown user";
  return { id: u.userId, name, email };
}

export async function searchOrgMembers(
  orgId: string,
  query?: string,
  limit = 25,
): Promise<UserProfile[]> {
  const client = await clerkClient();
  const { data } = await client.organizations.getOrganizationMembershipList({
    organizationId: orgId,
    limit,
    orderBy:        "+first_name",
    ...(query?.trim() ? { query: query.trim() } : {}),
  });

  return data
    .map(membershipToProfile)
    .filter((m): m is UserProfile => m !== null);
}

export async function isOrgMember(orgId: string, targetUserId: string): Promise<boolean> {
  const client = await clerkClient();
  const { data } = await client.organizations.getOrganizationMembershipList({
    organizationId: orgId,
    userId:         [targetUserId],
    limit:          1,
  });
  return data.length > 0;
}
