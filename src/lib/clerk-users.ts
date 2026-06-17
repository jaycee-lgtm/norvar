import { clerkClient } from "@clerk/nextjs/server";

export type UserProfile = { id: string; name: string; email: string };

function displayName(user: {
  fullName: string | null;
  firstName: string | null;
  lastName: string | null;
  primaryEmailAddress?: { emailAddress: string } | null;
  emailAddresses?: { emailAddress: string }[];
}) {
  const email = user.primaryEmailAddress?.emailAddress
    ?? user.emailAddresses?.[0]?.emailAddress
    ?? "";
  return user.fullName
    || [user.firstName, user.lastName].filter(Boolean).join(" ")
    || email.split("@")[0]
    || "Unknown user";
}

function extractUserEmail(user: {
  primaryEmailAddress?: { emailAddress: string } | null;
  emailAddresses?: Array<{ emailAddress: string }>;
}): string {
  return user.primaryEmailAddress?.emailAddress
    ?? user.emailAddresses?.find(e => e.emailAddress)?.emailAddress
    ?? user.emailAddresses?.[0]?.emailAddress
    ?? "";
}

export async function resolveUserProfiles(ids: string[]): Promise<Record<string, UserProfile>> {
  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length) return {};

  const client = await clerkClient();
  const profiles: Record<string, UserProfile> = {};

  try {
    const { data } = await client.users.getUserList({ userId: unique, limit: unique.length });
    for (const user of data) {
      profiles[user.id] = {
        id:    user.id,
        name:  displayName(user),
        email: extractUserEmail(user),
      };
    }
  } catch {
    // fall through — fill missing below
  }

  for (const id of unique) {
    if (profiles[id]?.email) continue;
    try {
      const user = await client.users.getUser(id);
      const email = extractUserEmail(user);
      if (email) {
        profiles[id] = { id, name: displayName(user), email };
        continue;
      }

      const { data: memberships } = await client.users.getOrganizationMembershipList({ userId: id, limit: 10 });
      const membershipEmail = memberships
        .map(m => m.publicUserData?.identifier?.trim())
        .find(identifier => identifier && identifier.includes("@"));

      profiles[id] = {
        id,
        name:  displayName(user),
        email: membershipEmail ?? "",
      };
    } catch {
      profiles[id] = { id, name: "Unknown user", email: "" };
    }
  }

  return profiles;
}

/** Resolve notification email addresses for Clerk user ids (creator + assignees). */
export async function resolveNotificationEmails(userIds: string[]): Promise<string[]> {
  const unique = [...new Set(userIds.filter(Boolean))];
  if (!unique.length) return [];

  const client = await clerkClient();
  const emails = new Set<string>();

  for (const id of unique) {
    const before = emails.size;
    try {
      const user = await client.users.getUser(id);
      for (const entry of user.emailAddresses ?? []) {
        const email = entry.emailAddress?.trim().toLowerCase();
        if (email) emails.add(email);
      }
      const primary = user.primaryEmailAddress?.emailAddress?.trim().toLowerCase();
      if (primary) emails.add(primary);
    } catch {
      const profiles = await resolveUserProfiles([id]);
      const email = profiles[id]?.email?.trim().toLowerCase();
      if (email) emails.add(email);
    }

    if (emails.size === before) {
      try {
        const { data: memberships } = await client.users.getOrganizationMembershipList({ userId: id, limit: 10 });
        for (const membership of memberships) {
          const identifier = membership.publicUserData?.identifier?.trim().toLowerCase();
          if (identifier?.includes("@")) emails.add(identifier);
        }
      } catch {
        // ignore
      }
    }
  }

  return [...emails];
}

export async function findUserByEmail(email: string): Promise<UserProfile | null> {
  const trimmed = email.trim().toLowerCase();
  if (!trimmed) return null;

  const client = await clerkClient();
  const { data } = await client.users.getUserList({ emailAddress: [trimmed], limit: 1 });
  const user = data[0];
  if (!user) return null;

  return {
    id:    user.id,
    name:  displayName(user),
    email: user.primaryEmailAddress?.emailAddress ?? user.emailAddresses[0]?.emailAddress ?? trimmed,
  };
}
