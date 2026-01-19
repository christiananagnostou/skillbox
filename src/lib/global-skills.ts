import { getUserAgentPaths, getSystemAgentPaths } from "./agents.js";
import { discoverSkills } from "./discovery.js";

export type GlobalSkill = {
  name: string;
  installs: Array<{ scope: "user" | "system"; agent: string; path: string }>;
};

export const discoverGlobalSkills = async (projectRoot: string): Promise<GlobalSkill[]> => {
  const userPaths = getUserAgentPaths(projectRoot);
  const systemPaths = getSystemAgentPaths(projectRoot);
  const [userSkills, systemSkills] = await Promise.all([
    discoverSkills(userPaths),
    discoverSkills(systemPaths),
  ]);

  const entries: GlobalSkill[] = [];
  for (const skill of userSkills) {
    entries.push({
      name: skill.name,
      installs: [
        {
          scope: "user",
          agent: "unknown",
          path: skill.skillDir,
        },
      ],
    });
  }

  for (const skill of systemSkills) {
    entries.push({
      name: skill.name,
      installs: [
        {
          scope: "system",
          agent: "unknown",
          path: skill.skillDir,
        },
      ],
    });
  }

  return entries;
};
