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

export async function resolveUserProfiles(ids: string[]): Promise<Record<string, UserProfile>> {
  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length) return {};

  const client = await clerkClient();
  const profiles: Record<string, UserProfile> = {};

  try {
    const { data } = await client.users.getUserList({ userId: unique, limit: unique.length });
    for (const user of data) {
      const email = user.primaryEmailAddress?.emailAddress
        ?? user.emailAddresses[0]?.emailAddress
        ?? "";
      profiles[user.id] = { id: user.id, name: displayName(user), email };
    }
  } catch {
    // fall through — fill missing below
  }

  for (const id of unique) {
    if (profiles[id]) continue;
    try {
      const user = await client.users.getUser(id);
      const email = user.primaryEmailAddress?.emailAddress
        ?? user.emailAddresses[0]?.emailAddress
        ?? "";
      profiles[id] = { id, name: displayName(user), email };
    } catch {
      profiles[id] = { id, name: "Unknown user", email: "" };
    }
  }

  return profiles;
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
