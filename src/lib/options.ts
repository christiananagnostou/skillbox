import type { AgentId } from "./agents.js";
import { allAgents, isAgentId } from "./agents.js";
import type { SkillboxConfig } from "./config.js";

export function parseAgentList(value?: string): AgentId[] {
  if (!value) {
    return [];
  }
  return value
    .split(",")
    .map((agent) => agent.trim())
    .filter((agent) => agent.length > 0)
    .filter(isAgentId);
}

export function resolveAgentList(override: string | undefined, config: SkillboxConfig): AgentId[] {
  const parsed = parseAgentList(override);
  if (parsed.length > 0) {
    return parsed;
  }
  if (config.defaultAgents.length > 0) {
    return config.defaultAgents.filter(isAgentId);
  }
  return allAgents;
}
