export type SidebarMode = "chat" | "assess" | "contracts" | "draft";

export function getSidebarMode(pathname: string): SidebarMode {
  if (pathname === "/draft") return "draft";
  if (pathname === "/contracts") return "contracts";
  if (pathname === "/assess" || pathname === "/history") return "assess";
  return "chat";
}

export const NEW_ACTIONS: Record<SidebarMode, { href: string; label: string }> = {
  chat:      { href: "/chat",      label: "New chat" },
  assess:    { href: "/assess",    label: "New assessment" },
  contracts: { href: "/contracts", label: "New review" },
  draft:     { href: "/draft",     label: "New draft" },
};

export function getNewAction(pathname: string) {
  return NEW_ACTIONS[getSidebarMode(pathname)];
}
