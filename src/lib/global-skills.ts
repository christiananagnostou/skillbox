import type { AgentId } from "./agents.js";
import { getUserPathsForAgents } from "./agents.js";
import { discoverSkills } from "./discovery.js";

export type GlobalSkill = {
  name: string;
  installs: Array<{ scope: "user"; agent: AgentId; path: string }>;
};

export const discoverGlobalSkills = async (
  projectRoot: string,
  agents: AgentId[]
): Promise<GlobalSkill[]> => {
  const agentPaths = getUserPathsForAgents(projectRoot, agents);
  const skillMap = new Map<string, GlobalSkill>();

  for (const { agent, path: agentPath } of agentPaths) {
    const discovered = await discoverSkills([agentPath]);
    for (const skill of discovered) {
      const existing = skillMap.get(skill.name);
      if (existing) {
        const alreadyHasPath = existing.installs.some((i) => i.path === skill.skillDir);
        if (!alreadyHasPath) {
          existing.installs.push({ scope: "user", agent, path: skill.skillDir });
        }
      } else {
        skillMap.set(skill.name, {
          name: skill.name,
          installs: [{ scope: "user", agent, path: skill.skillDir }],
        });
      }
    }
  }

  return Array.from(skillMap.values());
};
