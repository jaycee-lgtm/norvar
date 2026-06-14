export type TimeOfDay = "morning" | "afternoon" | "evening";

export function getTimeOfDay(date = new Date()): TimeOfDay | undefined {
  const hour = date.getHours();
  if (hour >= 5 && hour < 12) return "morning";
  if (hour >= 12 && hour < 17) return "afternoon";
  if (hour >= 17 && hour < 22) return "evening";
  return undefined;
}

export function firstNameFromUser(
  user: { firstName?: string | null; fullName?: string | null } | null | undefined,
): string | undefined {
  const first = user?.firstName?.trim();
  if (first) return first;
  const full = user?.fullName?.trim();
  if (full) return full.split(/\s+/)[0];
  return undefined;
}
