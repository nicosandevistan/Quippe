import { execFileSync } from "node:child_process";

/**
 * The repo's GitHub URL for the landing-page footer link, or "/login" when the
 * origin remote is missing, not GitHub, or git is unavailable (e.g. a runtime
 * host with no checkout). Resolved once at module load; server-only.
 *
 * `git remote get-url origin` typically returns one of:
 *   https://github.com/owner/repo.git
 *   git@github.com:owner/repo.git
 * Both are normalized to https://github.com/owner/repo.
 */
export function githubUrl(): string {
  let raw: string;
  try {
    raw = execFileSync("git", ["remote", "get-url", "origin"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "/login";
  }
  const https = raw.match(/^https?:\/\/github\.com\/(.+?)(?:\.git)?\/?$/i);
  if (https) return `https://github.com/${https[1]}`;
  const ssh = raw.match(/^git@github\.com:(.+?)(?:\.git)?\/?$/i);
  if (ssh) return `https://github.com/${ssh[1]}`;
  return "/login";
}
