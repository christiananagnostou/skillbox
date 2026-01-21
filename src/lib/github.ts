import { fetchText } from "./fetcher.js";

export type RepoRef = {
  owner: string;
  repo: string;
  ref: string;
  path?: string;
};

const REPO_URL_REGEX = /^https?:\/\/github\.com\/(.+?)\/(.+?)(?:\.git)?(?:\/)?$/i;
const TREE_URL_REGEX = /^https?:\/\/github\.com\/(.+?)\/(.+?)\/tree\/([^/]+)\/(.+)$/i;

export function parseRepoRef(input: string): RepoRef | null {
  if (input.includes("github.com") && input.includes("/tree/")) {
    const match = input.match(TREE_URL_REGEX);
    if (!match) {
      return null;
    }
    return {
      owner: match[1],
      repo: match[2],
      ref: match[3],
      path: match[4],
    };
  }

  if (!input.includes("github.com") && input.includes("/")) {
    const [owner, repo] = input.split("/");
    if (!owner || !repo) {
      return null;
    }
    return { owner, repo, ref: "main" };
  }

  if (input.includes("github.com")) {
    const match = input.match(REPO_URL_REGEX);
    if (!match) {
      return null;
    }
    return {
      owner: match[1],
      repo: match[2].replace(/\.git$/, ""),
      ref: "main",
    };
  }

  return null;
}

export function buildRawUrl(ref: RepoRef, filePath: string): string {
  return `https://raw.githubusercontent.com/${ref.owner}/${ref.repo}/${ref.ref}/${filePath}`;
}

export async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetchText(url);
  return JSON.parse(response) as T;
}
