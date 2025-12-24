/**
 * Core business logic: tab metadata management and project assignment
 */

import type { TabMeta, Project, TabAssignment, Subproject, COLORS } from './types.js';
import { getDB } from './storage/db.js';
import { tabMetaCache, projectCache } from './storage/cache.js';
import { parseUrl, createSubprojectKey } from './utils/url.js';
import { tokenize, createCentroid, updateCentroid, hashTokens } from './utils/tokens.js';
import { TabMatcher } from './classifier/matcher.js';
import { contextTracker } from './classifier/context.js';

const matcher = new TabMatcher();

export async function upsertTabMeta(tab: chrome.tabs.Tab): Promise<TabMeta> {
  const db = await getDB();

  const existing = await db.getTab(tab.id!);
  const now = Date.now();

  const parsed = parseUrl(tab.url || '');
  if (!parsed) {
    throw new Error('Invalid tab URL');
  }

  const tokens = tokenize({
    host: parsed.host,
    pathTokens: parsed.pathTokens,
    title: tab.title,
  });

  const tabMeta: TabMeta = {
    tabId: tab.id!,
    windowId: tab.windowId,
    url: tab.url!,
    title: tab.title || '',
    host: parsed.host,
    pathTokens: parsed.pathTokens,
    queryKeys: parsed.queryKeys,
    pageSignals: existing?.pageSignals,
    createdAt: existing?.createdAt || now,
    lastActiveAt: existing?.lastActiveAt || now,
    activeScore: existing?.activeScore || 0,
    projectId: existing?.projectId,
    subprojectId: existing?.subprojectId,
    featuresHash: hashTokens(tokens),
    openerTabId: tab.openerTabId,
    manuallyAssigned: existing?.manuallyAssigned,
  };

  await db.putTab(tabMeta);
  tabMetaCache.set(tabMeta.tabId, tabMeta);

  return tabMeta;
}

export async function updateTabActivity(tabId: number, dwellTime: number = 0): Promise<void> {
  const db = await getDB();
  const tab = await db.getTab(tabId);

  if (tab) {
    tab.lastActiveAt = Date.now();
    tab.activeScore += dwellTime;
    await db.putTab(tab);
    tabMetaCache.set(tabId, tab);
  }
}

export async function assignTabToProject(
  tab: TabMeta,
  windowId: number
): Promise<TabAssignment> {
  if (tab.manuallyAssigned && tab.projectId) {
    return {
      tabId: tab.tabId,
      projectId: tab.projectId,
      subprojectId: tab.subprojectId,
      confidence: 1.0,
      method: 'manual',
    };
  }

  const db = await getDB();
  const projects = await db.getAllProjects();

  if (projects.length === 0) {
    const newProject = await createProjectForTab(tab);
    tab.projectId = newProject.projectId;
    tab.subprojectId = newProject.subprojects[0]?.subprojectId;
    await db.putTab(tab);

    return {
      tabId: tab.tabId,
      projectId: newProject.projectId,
      subprojectId: tab.subprojectId,
      confidence: 1.0,
      method: 'default',
    };
  }

  const context = await contextTracker.updateContext(windowId, tab);
  const bestMatch = matcher.getBestMatch(tab, projects, context);

  if (bestMatch && bestMatch.score > 0.5) {
    tab.projectId = bestMatch.projectId;
    tab.subprojectId = bestMatch.subprojectId;
    await db.putTab(tab);

    const project = await db.getProject(bestMatch.projectId);
    if (project) {
      project.lastActiveAt = Date.now();
      await updateProjectCentroid(project, tab);
    }

    return {
      tabId: tab.tabId,
      projectId: bestMatch.projectId,
      subprojectId: bestMatch.subprojectId,
      confidence: bestMatch.score,
      method: bestMatch.score > 0.8 ? 'deterministic' : 'semantic',
    };
  }

  const newProject = await createProjectForTab(tab);
  tab.projectId = newProject.projectId;
  tab.subprojectId = newProject.subprojects[0]?.subprojectId;
  await db.putTab(tab);

  return {
    tabId: tab.tabId,
    projectId: newProject.projectId,
    subprojectId: tab.subprojectId,
    confidence: 1.0,
    method: 'default',
  };
}

async function createProjectForTab(tab: TabMeta): Promise<Project> {
  const db = await getDB();
  const now = Date.now();

  const tokens = tokenize({
    host: tab.host,
    pathTokens: tab.pathTokens,
    title: tab.title,
  });

  const centroid = createCentroid([tokens]);

  const subprojectKey = createSubprojectKey(tab.host, tab.pathTokens, 2);

  const subproject: Subproject = {
    subprojectId: `sub_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    name: tab.pathTokens.slice(0, 2).join('/') || tab.host,
    signature: {
      host: tab.host,
      pathPrefix: tab.pathTokens.slice(0, 2).join('/'),
      tokenCentroid: centroid,
    },
    rules: [],
    createdAt: now,
    lastActiveAt: now,
  };

  const projectColors: readonly string[] = [
    '#ef4444', '#f97316', '#f59e0b', '#84cc16', '#10b981',
    '#06b6d4', '#3b82f6', '#6366f1', '#8b5cf6', '#ec4899'
  ];

  const existingProjects = await db.getAllProjects();
  const colorIndex = existingProjects.length % projectColors.length;

  const project: Project = {
    projectId: `proj_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    name: tab.host.replace(/^www\./, ''),
    color: projectColors[colorIndex],
    pinned: false,
    createdAt: now,
    lastActiveAt: now,
    activeScore: 0,
    centroid,
    rules: [{ type: 'host', value: tab.host, weight: 1.0 }],
    subprojects: [subproject],
  };

  await db.putProject(project);
  projectCache.set(project.projectId, project);

  return project;
}

async function updateProjectCentroid(project: Project, tab: TabMeta): Promise<void> {
  const db = await getDB();

  const tokens = tokenize({
    host: tab.host,
    pathTokens: tab.pathTokens,
    title: tab.title,
    h1: tab.pageSignals?.h1,
  });

  project.centroid = updateCentroid(project.centroid, tokens, 0.1);

  const subproject = project.subprojects.find(sp => sp.subprojectId === tab.subprojectId);
  if (subproject) {
    subproject.signature.tokenCentroid = updateCentroid(
      subproject.signature.tokenCentroid,
      tokens,
      0.2
    );
    subproject.lastActiveAt = Date.now();
  }

  await db.putProject(project);
  projectCache.set(project.projectId, project);
}

export async function getActiveContext(windowId: number) {
  return contextTracker.getContext(windowId);
}

export async function removeTab(tabId: number): Promise<void> {
  const db = await getDB();
  await db.deleteTab(tabId);
  tabMetaCache.delete(tabId);
}
