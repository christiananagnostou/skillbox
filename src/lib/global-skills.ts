import { getUserAgentPaths } from "./agents.js";
import { discoverSkills } from "./discovery.js";

export type GlobalSkill = {
  name: string;
  installs: Array<{ scope: "user"; agent: string; path: string }>;
};

export const discoverGlobalSkills = async (projectRoot: string): Promise<GlobalSkill[]> => {
  const userPaths = getUserAgentPaths(projectRoot);
  const userSkills = await discoverSkills(userPaths);

  return userSkills.map((skill) => ({
    name: skill.name,
    installs: [
      {
        scope: "user",
        agent: "unknown",
        path: skill.skillDir,
      },
    ],
  }));
};
