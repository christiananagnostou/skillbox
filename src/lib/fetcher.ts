import { execFileSync } from "node:child_process";

const GITHUB_HOSTS = ["api.github.com", "raw.githubusercontent.com"];

let cachedToken: string | null | undefined;

function getGitHubToken(): string | null {
  if (cachedToken !== undefined) return cachedToken;

  // Check environment variables first, then fall back to gh CLI
  const envToken = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  if (envToken) {
    cachedToken = envToken;
  } else {
    try {
      cachedToken =
        execFileSync("gh", ["auth", "token", "--hostname", "github.com"], {
          encoding: "utf8",
          stdio: ["pipe", "pipe", "pipe"],
          timeout: 5000,
        }).trim() || null;
    } catch {
      cachedToken = null;
    }
  }
  return cachedToken;
}

function isGitHubUrl(url: string): boolean {
  try {
    const { host, protocol } = new URL(url);
    return protocol === "https:" && GITHUB_HOSTS.includes(host);
  } catch {
    return false;
  }
}

async function fetchResponse(url: string): Promise<Response> {
  let currentUrl = new URL(url);
  const initialOrigin = currentUrl.origin;
  let allowCredentials = true;
  const signal = AbortSignal.timeout(30000);

  for (let redirects = 0; redirects <= 5; redirects++) {
    if (currentUrl.protocol !== "https:" && currentUrl.protocol !== "http:") {
      throw new Error("Only HTTP and HTTPS source URLs are supported.");
    }
    const headers: Record<string, string> = {};
    if (allowCredentials && isGitHubUrl(currentUrl.href)) {
      const token = getGitHubToken();
      if (token) headers.Authorization = `Bearer ${token}`;
    }
    const response = await fetch(currentUrl.href, { headers, signal, redirect: "manual" });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");
      await response.body?.cancel();
      if (!location) throw new Error("Source redirect is missing a Location header.");
      if (redirects === 5) throw new Error("Source exceeded the maximum of five redirects.");
      const nextUrl = new URL(location, currentUrl);
      // Once a redirect crosses origins, credentials stay disabled for the entire chain.
      allowCredentials = allowCredentials && nextUrl.origin === initialOrigin;
      currentUrl = nextUrl;
      continue;
    }
    if (!response.ok) {
      throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
    }
    return response;
  }
  throw new Error("Source exceeded the maximum of five redirects.");
}

export async function fetchText(url: string): Promise<string> {
  return (await fetchResponse(url)).text();
}

export async function fetchBytes(url: string): Promise<Uint8Array> {
  return new Uint8Array(await (await fetchResponse(url)).arrayBuffer());
}
