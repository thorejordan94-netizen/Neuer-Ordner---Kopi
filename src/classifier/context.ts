/**
 * Active context tracking: rolling window of recent activity
 */

import type { ActiveContext, RecentTabActivity, TabMeta } from '../types.js';
import { getDB } from '../storage/db.js';

const CONTEXT_WINDOW_MS = 30 * 60 * 1000; // 30 minutes
const DWELL_TIME_WEIGHT = 0.7;
const RECENCY_WEIGHT = 0.3;

export class ContextTracker {
  private activeContexts = new Map<number, ActiveContext>();

  async updateContext(windowId: number, activatedTab: TabMeta): Promise<ActiveContext> {
    const now = Date.now();
    const db = await getDB();

    const windowTabs = await db.getTabsByWindow(windowId);

    const recentTabs: RecentTabActivity[] = windowTabs
      .filter(tab => now - tab.lastActiveAt < CONTEXT_WINDOW_MS)
      .map(tab => {
        const timeSinceActive = now - tab.lastActiveAt;
        const recencyScore = 1 - timeSinceActive / CONTEXT_WINDOW_MS;
        const dwellScore = Math.min(1, tab.activeScore / 60000); // normalize to 1 minute

        return {
          tabId: tab.tabId,
          projectId: tab.projectId,
          subprojectId: tab.subprojectId,
          lastActiveAt: tab.lastActiveAt,
          dwellTime: tab.activeScore,
          weight: DWELL_TIME_WEIGHT * dwellScore + RECENCY_WEIGHT * recencyScore,
        };
      })
      .sort((a, b) => b.weight - a.weight);

    const context: ActiveContext = {
      windowId,
      activeProjectId: activatedTab.projectId,
      activeSubprojectId: activatedTab.subprojectId,
      recentTabs,
      computedAt: now,
    };

    this.activeContexts.set(windowId, context);
    return context;
  }

  getContext(windowId: number): ActiveContext | undefined {
    const context = this.activeContexts.get(windowId);

    if (context && Date.now() - context.computedAt < 5000) {
      return context;
    }

    return undefined;
  }

  clearContext(windowId: number): void {
    this.activeContexts.delete(windowId);
  }
}

export const contextTracker = new ContextTracker();
