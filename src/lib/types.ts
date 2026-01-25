export type SkillSourceType = "url" | "git" | "local" | "convert";

export type SkillSource = {
  type: SkillSourceType;
  url?: string;
  repo?: string;
  path?: string;
  ref?: string;
  value?: string;
};

export type SkillMetadata = {
  name: string;
  version: string;
  description?: string;
  entry: string;
  namespace?: string;
  categories?: string[];
  tags?: string[];
  source: SkillSource;
  checksum: string;
  updatedAt: string;
};

export type IndexedSkill = {
  name: string;
  source: SkillSource;
  checksum: string;
  updatedAt: string;
  lastChecked?: string;
  lastSync?: string;
  namespace?: string;
  categories?: string[];
  tags?: string[];
  installs?: SkillInstall[];
};

export type SkillInstallScope = "user" | "project";

export type SkillInstall = {
  scope: SkillInstallScope;
  agent: string;
  path: string;
  projectRoot?: string;
};

export type SkillIndex = {
  version: 1;
  skills: IndexedSkill[];
};

export type ProjectEntry = {
  root: string;
  agentPaths?: Record<string, string[]>;
  skills?: string[];
};

export type ProjectIndex = {
  version: 1;
  projects: ProjectEntry[];
};
