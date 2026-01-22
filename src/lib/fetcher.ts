import { execSync } from "node:child_process";

const GITHUB_HOSTS = ["api.github.com", "raw.githubusercontent.com"];

let cachedToken: string | null | undefined;

function getGitHubToken(): string | null {
  if (cachedToken !== undefined) {
    return cachedToken;
  }

  // Check environment variables first
  const envToken = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  if (envToken) {
    cachedToken = envToken;
    return cachedToken;
  }

  // Fall back to gh CLI
  try {
    const token = execSync("gh auth token", {
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
    cachedToken = token || null;
    return cachedToken;
  } catch {
    cachedToken = null;
    return null;
  }
}

function isGitHubUrl(url: string): boolean {
  try {
    const { host } = new URL(url);
    return GITHUB_HOSTS.includes(host);
  } catch {
    return false;
  }
}

export async function fetchText(url: string): Promise<string> {
  const headers: Record<string, string> = {};

  if (isGitHubUrl(url)) {
    const token = getGitHubToken();
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
  }

  const response = await fetch(url, { headers });
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
  }
  return response.text();
}
