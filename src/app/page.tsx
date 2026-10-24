import Link from "next/link";
import { githubUrl } from "./github-link";

/**
 * Landing page (visual refresh; matches docs/design/landing.html in copy,
 * layout, and color). `/` always shows this page; `/login` is the account
 * picker. There is no redirect here anymore.
 *
 * Every real CTA ("Sign in", "Create a club account", "I work at a biotech
 * company", "Set up your company", footer "Sign in") goes to /login. In-page
 * anchors (#clubs, #companies, #how) stay anchors. The footer "GitHub" link
 * points at the repo's GitHub remote when there is one, else /login.
 *
 * The landing page has its own header/footer and does NOT use PageShell.
 * The sample-ask checkmarks draw on with a CSS animation disabled under
 * prefers-reduced-motion (see .chk in globals.css).
 */

/** A drawn-on checkmark for a covered line. `delay` is the animation delay. */
function Check({ d, delay }: { d: string; delay: string }) {
  return (
    <svg
      className="chk"
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="#2142C6"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-label="Covered"
    >
      <path pathLength={30} style={{ animationDelay: delay }} d={d} />
    </svg>
  );
}

function CoveredRow({
  d,
  delay,
  item,
  who,
}: {
  d: string;
  delay: string;
  item: string;
  who: string;
}) {
  return (
    <div
      className="grid grid-cols-[26px_1fr_auto] items-center gap-2.5 border-b border-[#DCE2F4] py-[9px] text-[15px] last:border-b-0"
      role="listitem"
    >
      <Check d={d} delay={delay} />
      <span>{item}</span>
      <span className="whitespace-nowrap text-[13px] text-muted">{who}</span>
    </div>
  );
}

export default function Home() {
  const github = githubUrl();
  return (
    <div className="bg-white font-sans text-ink text-base leading-[1.55]">
      {/* Header -------------------------------------------------------- */}
      <header className="border-b border-line">
        <div className="mx-auto flex max-w-[1160px] flex-wrap items-center gap-x-7 gap-y-3 px-6 py-3.5">
          <Link
            href="/"
            className="text-[22px] font-extrabold tracking-[-0.02em] text-ink focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pen"
          >
            Quippe
          </Link>
          <nav
            aria-label="Main"
            className="flex grow gap-[22px] text-[15px]"
          >
            <a href="#clubs" className="text-graphite hover:underline">
              For clubs
            </a>
            <a href="#companies" className="text-graphite hover:underline">
              For companies
            </a>
            <a href="#how" className="text-graphite hover:underline">
              How it works
            </a>
          </nav>
          <div className="flex items-center gap-4">
            <Link
              href="/login"
              className="font-semibold text-ink hover:underline focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pen"
            >
              Sign in
            </Link>
            <Link
              href="/login"
              className="inline-flex h-[38px] items-center rounded-control bg-pen px-[18px] text-sm font-semibold text-white hover:bg-pen-hover focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pen"
            >
              Create a club account
            </Link>
          </div>
        </div>
      </header>

      <main>
        {/* Hero -------------------------------------------------------- */}
        <section className="mx-auto flex max-w-[1160px] flex-wrap items-center gap-x-14 gap-y-12 px-6 pb-20 pt-[72px]">
          <div className="min-w-0 flex-[1_1_440px]">
            <h1 className="m-0 max-w-[12ch] text-[clamp(40px,5.6vw,66px)] font-extrabold leading-[1.02] tracking-[-0.035em]">
              Your club&apos;s supply list, covered by biotech down the street.
            </h1>
            <p className="mb-8 mt-6 max-w-[34em] text-[19px] leading-[1.5] text-graphite">
              Post what your next workshop needs. Biotech companies nearby see
              it, cover what they have in surplus, and open their labs for tours
              and talks. No more cold emails.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link
                href="/login"
                className="inline-flex h-11 items-center rounded-control bg-pen px-[18px] text-[15px] font-semibold text-white hover:bg-pen-hover focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pen"
              >
                Create a club account
              </Link>
              <Link
                href="/login"
                className="inline-flex h-11 items-center rounded-control border border-[#D5D9E0] bg-white px-[18px] text-[15px] font-semibold text-ink hover:bg-bench focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pen"
              >
                I work at a biotech company
              </Link>
            </div>
            <p className="mt-[18px] text-sm text-muted">
              Free for high school clubs, college clubs, and undergrad labs.
            </p>
          </div>

          {/* Sample ask card ----------------------------------------- */}
          <figure className="m-0 min-w-0 flex-[1_1_420px]">
            <div className="slip rounded-control border border-[#CDD5EE] px-6 pb-[18px] pt-[22px]">
              <div className="flex flex-wrap items-baseline justify-between gap-3 border-b-2 border-ink pb-3">
                <div>
                  <div className="text-[19px] font-bold tracking-[-0.01em]">
                    DNA extraction and gel workshop
                  </div>
                  <div className="text-[13px] text-muted">
                    Latinos in STEM Society, 25 students
                  </div>
                </div>
                <div className="text-[13px] tabular-nums text-muted">
                  Needed by Nov 14
                </div>
              </div>
              <div role="list">
                <CoveredRow
                  d="M3.5 12.5c2 1.2 3.6 3.4 5.2 6.2C11.6 12.6 15.4 7.6 20.5 4"
                  delay=".5s"
                  item="Microcentrifuge tubes, 50"
                  who="Harborview"
                />
                <CoveredRow
                  d="M3.5 13c2.2 1 3.8 3 5.2 5.6C11.8 12.2 15.6 7.8 20.8 4.6"
                  delay=".8s"
                  item="Pipette tips, 2 racks"
                  who="Harborview"
                />
                <CoveredRow
                  d="M3.8 12.2c1.9 1.4 3.4 3.6 4.9 6.4C11.4 12.8 15.2 7.4 20.4 4.2"
                  delay="1.1s"
                  item="Agarose, 10 g"
                  who="Harborview"
                />
                <CoveredRow
                  d="M3.5 12.8c2.1 1.1 3.7 3.2 5.1 5.9C11.7 12.4 15.5 7.6 20.6 4.4"
                  delay="1.4s"
                  item="Gel box and power supply, on loan"
                  who="Tidepool"
                />
                <CoveredRow
                  d="M3.6 12.4c2 1.3 3.5 3.5 5 6.2C11.5 12.6 15.3 7.5 20.5 4.3"
                  delay="1.7s"
                  item="DNA ladder and loading dye"
                  who="Tidepool"
                />
                <div
                  className="grid grid-cols-[26px_1fr_auto] items-center gap-2.5 border-b border-[#DCE2F4] py-[9px] text-[15px] last:border-b-0"
                  role="listitem"
                >
                  <svg
                    width="22"
                    height="22"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#B9C2DD"
                    strokeWidth="2"
                    aria-label="Still needed"
                  >
                    <rect x="4.5" y="4.5" width="15" height="15" rx="2" />
                  </svg>
                  <span>Isopropyl alcohol, 500 mL</span>
                  <span className="whitespace-nowrap text-[13px] text-needed">
                    Pharmacy
                  </span>
                </div>
              </div>
              <div className="mt-3 border-t border-[#DCE2F4] pt-3 text-sm tabular-nums text-graphite">
                8 of 10 items covered by two companies within 5 miles.
              </div>
            </div>
            <figcaption className="mt-2.5 text-[13px] text-muted">
              A real ask from the demo: Quippe built the list from the
              club&apos;s protocol.
            </figcaption>
          </figure>
        </section>

        {/* How it works ---------------------------------------------- */}
        <section
          id="how"
          aria-labelledby="how-h"
          className="border-y border-line bg-bench"
        >
          <div className="mx-auto max-w-[1160px] px-6 py-16">
            <h2
              id="how-h"
              className="mb-8 mt-0 text-[32px] font-bold leading-[1.15] tracking-[-0.025em]"
            >
              How it works
            </h2>
            <ol className="m-0 flex list-none flex-wrap gap-x-10 gap-y-8 p-0">
              <li className="flex-[1_1_260px] border-t-2 border-ink pt-3.5">
                <span className="text-[15px] font-bold text-pen">Step 1</span>
                <h3 className="my-1.5 text-lg font-semibold tracking-[-0.01em]">
                  Post what you need
                </h3>
                <p className="m-0 max-w-[38ch] text-[15px] text-graphite">
                  Ask for supplies, a lab tour, or a speaker. Paste a protocol
                  and Quippe works out the supply list and amounts for your
                  group size.
                </p>
              </li>
              <li className="flex-[1_1_260px] border-t-2 border-ink pt-3.5">
                <span className="text-[15px] font-bold text-pen">Step 2</span>
                <h3 className="my-1.5 text-lg font-semibold tracking-[-0.01em]">
                  Nearby companies say yes
                </h3>
                <p className="m-0 max-w-[38ch] text-[15px] text-graphite">
                  A liaison at each company sees the asks that fit their surplus
                  and schedule, and accepts with one click. High school asks go
                  to your advisor first.
                </p>
              </li>
              <li className="flex-[1_1_260px] border-t-2 border-ink pt-3.5">
                <span className="text-[15px] font-bold text-pen">Step 3</span>
                <h3 className="my-1.5 text-lg font-semibold tracking-[-0.01em]">
                  Keep the relationship
                </h3>
                <p className="m-0 max-w-[38ch] text-[15px] text-graphite">
                  Every donation, tour, and talk goes on your club&apos;s
                  timeline. When officers graduate, Quippe writes the handoff
                  for next year&apos;s board.
                </p>
              </li>
            </ol>
          </div>
        </section>

        {/* For clubs / For companies --------------------------------- */}
        <section className="mx-auto flex max-w-[1160px] flex-wrap gap-x-16 gap-y-12 px-6 py-[72px]">
          <div id="clubs" className="min-w-0 flex-[1_1_400px]">
            <h2 className="mb-3 mt-0 text-[28px] font-bold leading-[1.2] tracking-[-0.02em]">
              For clubs
            </h2>
            <p className="mb-[18px] mt-0 max-w-[46ch] text-graphite">
              Built for groups that run on a small budget and a lot of emails:
              STEM clubs, affinity groups like SACNAS and SHPE chapters, and
              undergrad research labs.
            </p>
            <ul className="m-0 flex list-disc flex-col gap-2 pl-5 text-graphite">
              <li>
                One place to ask every company near you, instead of cold
                emailing each one
              </li>
              <li>
                Supply lists sized to your group, with grocery and pharmacy
                swaps for what&apos;s left
              </li>
              <li>
                Introductions to employee groups that share your community
              </li>
            </ul>
            <Link
              href="/login"
              className="mt-6 inline-flex h-11 items-center rounded-control bg-pen px-[18px] text-[15px] font-semibold text-white hover:bg-pen-hover focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pen"
            >
              Create a club account
            </Link>
          </div>
          <div id="companies" className="min-w-0 flex-[1_1_400px]">
            <h2 className="mb-3 mt-0 text-[28px] font-bold leading-[1.2] tracking-[-0.02em]">
              For biotech companies
            </h2>
            <p className="mb-[18px] mt-0 max-w-[46ch] text-graphite">
              Your liaison gets one inbox of student requests, ranked by how
              well they fit what you can give. Surplus goes to classrooms
              instead of the bin.
            </p>
            <div className="overflow-x-auto rounded-panel border border-line">
              <table
                className="w-full border-collapse text-[13px]"
                aria-label="Example of a company's matched asks"
              >
                <tbody>
                  <tr>
                    <td className="border-b border-[#EDEFF2] px-3 py-2.5 font-semibold">
                      Supplies for a gel workshop
                    </td>
                    <td className="border-b border-[#EDEFF2] px-3 py-2.5 text-muted">
                      Latinos in STEM Society
                    </td>
                    <td className="whitespace-nowrap border-b border-[#EDEFF2] px-3 py-2.5 font-semibold text-pen">
                      Strong fit
                    </td>
                  </tr>
                  <tr>
                    <td className="border-b border-[#EDEFF2] px-3 py-2.5 font-semibold">
                      Lab tour for 15 members
                    </td>
                    <td className="border-b border-[#EDEFF2] px-3 py-2.5 text-muted">
                      Latinos in STEM Society
                    </td>
                    <td className="whitespace-nowrap border-b border-[#EDEFF2] px-3 py-2.5 font-semibold text-pen">
                      Good fit
                    </td>
                  </tr>
                  <tr>
                    <td className="px-3 py-2.5 font-semibold">
                      Careers in biotech talk
                    </td>
                    <td className="px-3 py-2.5 text-muted">
                      Northgate High Biology Club
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 font-semibold text-muted">
                      Fair fit
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <Link
              href="/login"
              className="mt-6 inline-flex h-11 items-center rounded-control border border-[#D5D9E0] bg-white px-[18px] text-[15px] font-semibold text-ink hover:bg-bench focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pen"
            >
              Set up your company
            </Link>
          </div>
        </section>

        {/* Why we built this ----------------------------------------- */}
        <section aria-labelledby="why" className="border-t border-line">
          <div className="mx-auto max-w-[760px] px-6 py-[72px]">
            <h2
              id="why"
              className="mb-4 mt-0 text-[28px] font-bold leading-[1.2] tracking-[-0.02em]"
            >
              Why we built this
            </h2>
            <p className="mb-3.5 mt-0 text-lg leading-[1.6] text-graphite">
              We ran a STEM club for underrepresented students with almost no
              budget. Every workshop meant cold emailing companies for pipette
              tips and agarose, and hoping someone wrote back.
            </p>
            <p className="m-0 text-lg leading-[1.6] text-graphite">
              The companies we did reach wanted to help. They just had no easy
              way to find us. Quippe is that way.
            </p>
          </div>
        </section>
      </main>

      {/* Footer ------------------------------------------------------- */}
      <footer className="bg-ink text-[#C9CED6]">
        <div className="mx-auto flex max-w-[1160px] flex-wrap justify-between gap-3 px-6 py-7 text-sm">
          <span>
            <span className="mr-2.5 font-extrabold text-white">Quippe</span>
            Made at Hackachusetts 2026
          </span>
          <span className="flex gap-5">
            <Link href="/login" className="text-[#C9CED6] hover:underline">
              Sign in
            </Link>
            <a
              href={github}
              className="text-[#C9CED6] hover:underline"
              {...(github.startsWith("http")
                ? { target: "_blank", rel: "noreferrer noopener" }
                : {})}
            >
              GitHub
            </a>
          </span>
        </div>
      </footer>
    </div>
  );
}
