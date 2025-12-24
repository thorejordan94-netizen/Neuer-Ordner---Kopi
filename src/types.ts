/**
 * Core type definitions for Project Rail Tabs
 */

export interface TabMeta {
  tabId: number;
  windowId: number;
  url: string;
  title: string;
  host: string;
  pathTokens: string[];
  queryKeys: string[];
  pageSignals?: PageSignals;
  createdAt: number;
  lastActiveAt: number;
  activeScore: number;
  projectId?: string;
  subprojectId?: string;
  featuresHash: string;
  embeddingId?: string;
  openerTabId?: number;
  manuallyAssigned?: boolean;
}

export interface PageSignals {
  h1?: string;
  metaDescription?: string;
  ogTitle?: string;
  extractedAt: number;
}

export interface Project {
  projectId: string;
  name: string;
  color: string;
  pinned: boolean;
  createdAt: number;
  lastActiveAt: number;
  activeScore: number;
  centroid: TokenCentroid;
  rules: ProjectRule[];
  subprojects: Subproject[];
  locked?: boolean;
}

export interface Subproject {
  subprojectId: string;
  name: string;
  signature: SubprojectSignature;
  rules: ProjectRule[];
  createdAt: number;
  lastActiveAt: number;
}

export interface SubprojectSignature {
  host: string;
  pathPrefix: string;
  tokenCentroid: TokenCentroid;
}

export interface TokenCentroid {
  tokens: Map<string, number>;
  totalWeight: number;
}

export interface ProjectRule {
  type: 'domain' | 'host' | 'path_prefix' | 'keyword_include' | 'keyword_exclude';
  value: string;
  weight: number;
}

export interface ActiveContext {
  windowId: number;
  activeProjectId?: string;
  activeSubprojectId?: string;
  recentTabs: RecentTabActivity[];
  computedAt: number;
}

export interface RecentTabActivity {
  tabId: number;
  projectId?: string;
  subprojectId?: string;
  lastActiveAt: number;
  dwellTime: number;
  weight: number;
}

export interface TabAssignment {
  tabId: number;
  projectId: string;
  subprojectId?: string;
  confidence: number;
  method: 'deterministic' | 'semantic' | 'context' | 'manual' | 'default';
  reasoning?: string;
}

export interface ScoringResult {
  projectId: string;
  subprojectId?: string;
  score: number;
  breakdown: {
    hostMatch: number;
    pathMatch: number;
    tokenSimilarity: number;
    chainProximity: number;
    recencyBoost: number;
  };
}

export interface UserSettings {
  railPosition: 'left' | 'right';
  collapsedWidth: number;
  expandedWidth: number;
  autoExpand: boolean;
  disabledSites: string[];
  defaultProjectColor: string;
  contextWindowMinutes: number;
  reassignmentThreshold: number;
}

export interface RuntimeMessage {
  type: 'CONTEXT_UPDATED' | 'TAB_UPDATED' | 'PAGE_SIGNALS' | 'UI_ACTION' | 'GET_STATE';
  windowId?: number;
  tabId?: number;
  assignment?: TabAssignment;
  signals?: PageSignals;
  action?: UIAction;
  data?: any;
}

export interface UIAction {
  action: 'activate_tab' | 'close_tab' | 'pin_tab' | 'mute_tab' |
          'rename_project' | 'pin_project' | 'lock_project' | 'split_project' | 'merge_projects' |
          'move_tab_to_project' | 'create_project' | 'delete_project';
  tabId?: number;
  projectId?: string;
  subprojectId?: string;
  value?: any;
}

export interface SubprojectKey {
  host: string;
  pathPrefix: string;
  key: string;
}

export const COLORS = [
  '#ef4444', // red
  '#f97316', // orange
  '#f59e0b', // amber
  '#84cc16', // lime
  '#10b981', // emerald
  '#06b6d4', // cyan
  '#3b82f6', // blue
  '#6366f1', // indigo
  '#8b5cf6', // violet
  '#ec4899', // pink
] as const;

export const DEFAULT_SETTINGS: UserSettings = {
  railPosition: 'right',
  collapsedWidth: 12,
  expandedWidth: 320,
  autoExpand: true,
  disabledSites: ['chrome://', 'chrome-extension://'],
  defaultProjectColor: COLORS[0],
  contextWindowMinutes: 30,
  reassignmentThreshold: 0.75,
};
