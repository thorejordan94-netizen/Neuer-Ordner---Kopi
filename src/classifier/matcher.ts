/**
 * Hybrid classifier: Tier A (deterministic) + Tier B (semantic)
 */

import type { TabMeta, Project, ScoringResult, ActiveContext } from '../types.js';
import { weightedTokenSimilarity, tokenize } from '../utils/tokens.js';
import { createSubprojectKey, getPathPrefix } from '../utils/url.js';

export interface MatcherConfig {
  hostMatchWeight: number;
  pathMatchWeight: number;
  chainWeight: number;
  tokenWeight: number;
  recencyWeight: number;
  minThreshold: number;
}

export const DEFAULT_MATCHER_CONFIG: MatcherConfig = {
  hostMatchWeight: 3.0,
  pathMatchWeight: 2.0,
  chainWeight: 2.0,
  tokenWeight: 1.5,
  recencyWeight: 1.0,
  minThreshold: 0.3,
};

export class TabMatcher {
  constructor(private config: MatcherConfig = DEFAULT_MATCHER_CONFIG) {}

  scoreTabForProject(
    tab: TabMeta,
    project: Project,
    context?: ActiveContext
  ): ScoringResult {
    const breakdown = {
      hostMatch: this.scoreHostMatch(tab, project),
      pathMatch: this.scorePathMatch(tab, project),
      tokenSimilarity: this.scoreTokenSimilarity(tab, project),
      chainProximity: this.scoreChainProximity(tab, project, context),
      recencyBoost: this.scoreRecencyBoost(project, context),
    };

    const score =
      this.config.hostMatchWeight * breakdown.hostMatch +
      this.config.pathMatchWeight * breakdown.pathMatch +
      this.config.tokenWeight * breakdown.tokenSimilarity +
      this.config.chainWeight * breakdown.chainProximity +
      this.config.recencyWeight * breakdown.recencyBoost;

    const bestSubproject = this.findBestSubproject(tab, project);

    return {
      projectId: project.projectId,
      subprojectId: bestSubproject?.subprojectId,
      score,
      breakdown,
    };
  }

  private scoreHostMatch(tab: TabMeta, project: Project): number {
    for (const rule of project.rules) {
      if (rule.type === 'host' && tab.host === rule.value) {
        return 1.0;
      }
      if (rule.type === 'domain') {
        const tabDomain = tab.host.split('.').slice(-2).join('.');
        if (tabDomain === rule.value) {
          return 0.8;
        }
      }
    }

    for (const subproject of project.subprojects) {
      if (subproject.signature.host === tab.host) {
        return 0.9;
      }
    }

    return 0;
  }

  private scorePathMatch(tab: TabMeta, project: Project): number {
    let maxScore = 0;

    for (const rule of project.rules) {
      if (rule.type === 'path_prefix') {
        const tabPath = tab.pathTokens.join('/');
        if (tabPath.startsWith(rule.value)) {
          const depth = rule.value.split('/').length;
          const score = Math.min(1.0, depth * 0.25);
          maxScore = Math.max(maxScore, score);
        }
      }
    }

    for (const subproject of project.subprojects) {
      const pathPrefix = subproject.signature.pathPrefix;
      const tabPath = tab.pathTokens.join('/');
      if (tabPath.startsWith(pathPrefix)) {
        const depth = pathPrefix.split('/').length;
        const score = Math.min(1.0, depth * 0.25);
        maxScore = Math.max(maxScore, score);
      }
    }

    return maxScore;
  }

  private scoreTokenSimilarity(tab: TabMeta, project: Project): number {
    const tabTokens = tokenize({
      host: tab.host,
      pathTokens: tab.pathTokens,
      title: tab.title,
      h1: tab.pageSignals?.h1,
      meta: tab.pageSignals?.metaDescription,
    });

    return weightedTokenSimilarity(project.centroid, tabTokens);
  }

  private scoreChainProximity(
    tab: TabMeta,
    project: Project,
    context?: ActiveContext
  ): number {
    if (!context) return 0;

    if (context.activeProjectId === project.projectId) {
      return 1.0;
    }

    const recentProjectActivity = context.recentTabs.find(
      rt => rt.projectId === project.projectId
    );

    if (recentProjectActivity) {
      return recentProjectActivity.weight * 0.8;
    }

    return 0;
  }

  private scoreRecencyBoost(project: Project, context?: ActiveContext): number {
    if (!context) return 0;

    if (context.activeProjectId === project.projectId) {
      return 1.0;
    }

    const timeSinceActive = Date.now() - project.lastActiveAt;
    const minutes = timeSinceActive / (1000 * 60);

    if (minutes < 5) return 0.9;
    if (minutes < 15) return 0.6;
    if (minutes < 30) return 0.3;
    return 0;
  }

  private findBestSubproject(tab: TabMeta, project: Project) {
    if (project.subprojects.length === 0) return null;

    const subprojectKey = createSubprojectKey(tab.host, tab.pathTokens, 2);

    const exactMatch = project.subprojects.find(
      sp => `${sp.signature.host}:${sp.signature.pathPrefix}` === subprojectKey
    );

    if (exactMatch) return exactMatch;

    let bestSubproject = project.subprojects[0];
    let bestScore = -1;

    const tabTokens = tokenize({
      host: tab.host,
      pathTokens: tab.pathTokens,
      title: tab.title,
    });

    for (const subproject of project.subprojects) {
      let score = 0;

      if (subproject.signature.host === tab.host) {
        score += 0.5;
      }

      const pathPrefix = subproject.signature.pathPrefix;
      const tabPath = tab.pathTokens.join('/');
      if (tabPath.startsWith(pathPrefix)) {
        score += 0.3;
      }

      score += weightedTokenSimilarity(subproject.signature.tokenCentroid, tabTokens) * 0.2;

      if (score > bestScore) {
        bestScore = score;
        bestSubproject = subproject;
      }
    }

    return bestScore > 0.3 ? bestSubproject : null;
  }

  scoreAllProjects(
    tab: TabMeta,
    projects: Project[],
    context?: ActiveContext
  ): ScoringResult[] {
    const results = projects
      .map(project => this.scoreTabForProject(tab, project, context))
      .filter(result => result.score >= this.config.minThreshold)
      .sort((a, b) => b.score - a.score);

    return results;
  }

  getBestMatch(
    tab: TabMeta,
    projects: Project[],
    context?: ActiveContext
  ): ScoringResult | null {
    const candidateProjects = this.narrowCandidates(tab, projects);
    const results = this.scoreAllProjects(tab, candidateProjects, context);
    return results[0] || null;
  }

  private narrowCandidates(tab: TabMeta, projects: Project[]): Project[] {
    const sameHostProjects = projects.filter(p =>
      p.subprojects.some(sp => sp.signature.host === tab.host) ||
      p.rules.some(r => r.type === 'host' && r.value === tab.host)
    );

    if (sameHostProjects.length > 0) {
      return sameHostProjects;
    }

    const sameDomainProjects = projects.filter(p => {
      const tabDomain = tab.host.split('.').slice(-2).join('.');
      return p.rules.some(r => r.type === 'domain' && r.value === tabDomain);
    });

    if (sameDomainProjects.length > 0) {
      return sameDomainProjects;
    }

    const recentProjects = projects
      .filter(p => Date.now() - p.lastActiveAt < 30 * 60 * 1000)
      .sort((a, b) => b.lastActiveAt - a.lastActiveAt)
      .slice(0, 15);

    return recentProjects.length > 0 ? recentProjects : projects.slice(0, 20);
  }
}
