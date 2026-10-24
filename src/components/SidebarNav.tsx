"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { NavLink } from "./PageShell";

/**
 * The sidebar's role navigation (client component so it can read the current
 * path and mark the active link). Kept small so PageShell stays a server
 * component: it only needs the already-computed nav links.
 *
 * Active link = the one whose href is the current path, or whose href is a
 * prefix of it (so /org/org-liss/anything still highlights "Club page"). The
 * longest matching href wins, and "/" is never treated as a prefix match.
 */
export function SidebarNav({ links }: { links: NavLink[] }) {
  const pathname = usePathname();
  const activeHref = bestMatch(
    links.map((l) => l.href),
    pathname,
  );
  return (
    <nav
      aria-label="Main"
      className="flex flex-col gap-0.5 text-sm font-medium"
    >
      {links.map((l) => {
        const isActive = l.href === activeHref;
        return (
          <Link
            key={l.href}
            href={l.href}
            aria-current={isActive ? "page" : undefined}
            className={
              "flex items-center justify-between rounded-control px-2.5 py-[7px] focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pen " +
              (isActive
                ? "bg-white text-ink shadow-[inset_0_0_0_1px_theme(colors.line)]"
                : "text-graphite hover:bg-[#ECEEF2]")
            }
          >
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}

/** The longest nav href that equals or prefixes the current path, or null. */
function bestMatch(hrefs: string[], pathname: string | null): string | null {
  if (pathname === null) return null;
  let best: string | null = null;
  for (const href of hrefs) {
    if (href === "/") {
      if (pathname === "/" && (best === null || best.length < 1)) best = href;
      continue;
    }
    const matches = pathname === href || pathname.startsWith(href + "/");
    if (matches && (best === null || href.length > best.length)) best = href;
  }
  return best;
}
