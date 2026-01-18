import fs from "node:fs/promises";
import { skillboxProjectsPath, skillboxRoot } from "./paths.js";
import type { ProjectEntry, ProjectIndex } from "./types.js";

const emptyProjects = (): ProjectIndex => ({ version: 1, projects: [] });

export const loadProjects = async (): Promise<ProjectIndex> => {
  const filePath = skillboxProjectsPath();
  try {
    const content = await fs.readFile(filePath, "utf8");
    return JSON.parse(content) as ProjectIndex;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return emptyProjects();
    }
    throw error;
  }
};

export const saveProjects = async (index: ProjectIndex): Promise<void> => {
  await fs.mkdir(skillboxRoot(), { recursive: true });
  const json = JSON.stringify(index, null, 2);
  await fs.writeFile(skillboxProjectsPath(), `${json}\n`, "utf8");
};

export const upsertProject = (index: ProjectIndex, root: string): ProjectIndex => {
  const existing = index.projects.find((project) => project.root === root);
  if (existing) {
    return index;
  }
  return { ...index, projects: [...index.projects, { root }] };
};

export const findProject = (index: ProjectIndex, root: string): ProjectEntry | undefined => {
  return index.projects.find((project) => project.root === root);
};
