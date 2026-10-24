/**
 * Tests for the PageShell sidebar variants (UI polish: login sidebar).
 *
 * The login page uses `variant="minimal"`: only the Quippe wordmark, no
 * account box, no role-nav landmark, and no "Switch demo account" link, even
 * when a role is passed (someone is signed in). The default ("full") variant
 * is unchanged and still renders all three. Both keep the skip link and
 * `<main id="main">`.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PageShell } from "@/components/PageShell";

const NAV = [{ href: "/org/x", label: "My org" }];

describe("PageShell minimal variant", () => {
  const html = renderToStaticMarkup(
    <PageShell
      variant="minimal"
      role="club_officer"
      navLinks={NAV}
      orgName="Harbor High Bio Club"
    >
      <p>content</p>
    </PageShell>,
  );

  it("shows only the Quippe wordmark in the sidebar", () => {
    expect(html).toContain(">Quippe</a>");
  });

  it("hides the account box even when a role and org name are passed", () => {
    expect(html).not.toContain("Harbor High Bio Club");
    expect(html).not.toContain("Club officer");
  });

  it("renders no nav landmark", () => {
    expect(html).not.toContain("<nav");
    expect(html).not.toContain("My org");
  });

  it('does not render the "Switch demo account" link', () => {
    expect(html).not.toContain("Switch demo account");
  });

  it("keeps the skip link and <main id=main>", () => {
    expect(html).toContain('href="#main"');
    expect(html).toContain("Skip to main content");
    expect(html).toContain('id="main"');
  });
});

describe("PageShell default (full) variant", () => {
  const html = renderToStaticMarkup(
    <PageShell role="club_officer" navLinks={NAV} orgName="Harbor High Bio Club">
      <p>content</p>
    </PageShell>,
  );

  it("renders the account box, role nav, and switch link", () => {
    expect(html).toContain("Harbor High Bio Club");
    expect(html).toContain("Club officer");
    expect(html).toContain("<nav");
    expect(html).toContain("My org");
    expect(html).toContain("Switch demo account");
  });

  it("still keeps the skip link and <main id=main>", () => {
    expect(html).toContain('href="#main"');
    expect(html).toContain('id="main"');
  });
});
