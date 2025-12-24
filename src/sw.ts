/**
 * Service worker: tab event pipeline and state management
 */

import type { RuntimeMessage, UIAction } from './types.js';
import { upsertTabMeta, assignTabToProject, removeTab, updateTabActivity } from './core.js';
import { getDB } from './storage/db.js';

let lastActivation: { tabId: number; timestamp: number } | null = null;

chrome.runtime.onInstalled.addListener(async () => {
  console.log('Project Rail Tabs installed');

  const db = await getDB();

  const existingTabs = await chrome.tabs.query({});
  for (const tab of existingTabs) {
    if (tab.id && tab.url && !tab.url.startsWith('chrome://')) {
      try {
        await upsertTabMeta(tab);
      } catch (error) {
        console.warn('Failed to index tab:', tab.id, error);
      }
    }
  }

  chrome.alarms.create('cleanup', { periodInMinutes: 60 });
});

chrome.tabs.onActivated.addListener(async ({ tabId, windowId }) => {
  try {
    const now = Date.now();

    if (lastActivation && lastActivation.tabId !== tabId) {
      const dwellTime = now - lastActivation.timestamp;
      await updateTabActivity(lastActivation.tabId, dwellTime);
    }

    lastActivation = { tabId, timestamp: now };

    const tab = await chrome.tabs.get(tabId);
    if (!tab.url || tab.url.startsWith('chrome://')) return;

    const tabMeta = await upsertTabMeta(tab);
    const assignment = await assignTabToProject(tabMeta, windowId);

    broadcastUpdate({ type: 'CONTEXT_UPDATED', windowId, assignment });
  } catch (error) {
    console.error('Error in onActivated:', error);
  }
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (!changeInfo.title && !changeInfo.url && changeInfo.status !== 'complete') return;

  try {
    if (!tab.url || tab.url.startsWith('chrome://')) return;

    await upsertTabMeta(tab);

    broadcastUpdate({ type: 'TAB_UPDATED', tabId });
  } catch (error) {
    console.error('Error in onUpdated:', error);
  }
});

chrome.tabs.onRemoved.addListener(async (tabId) => {
  try {
    await removeTab(tabId);
    broadcastUpdate({ type: 'TAB_UPDATED', tabId });
  } catch (error) {
    console.error('Error in onRemoved:', error);
  }
});

chrome.tabs.onCreated.addListener(async (tab) => {
  try {
    if (!tab.url || tab.url.startsWith('chrome://')) return;
    await upsertTabMeta(tab);
  } catch (error) {
    console.error('Error in onCreated:', error);
  }
});

chrome.runtime.onMessage.addListener((message: RuntimeMessage, sender, sendResponse) => {
  (async () => {
    try {
      if (message.type === 'PAGE_SIGNALS' && message.signals && sender.tab?.id) {
        const db = await getDB();
        const tab = await db.getTab(sender.tab.id);
        if (tab) {
          tab.pageSignals = message.signals;
          await db.putTab(tab);
        }
        sendResponse({ success: true });
        return;
      }

      if (message.type === 'UI_ACTION' && message.action) {
        await handleUIAction(message.action);
        sendResponse({ success: true });
        return;
      }

      if (message.type === 'GET_STATE') {
        const db = await getDB();
        const projects = await db.getAllProjects();
        const tabs = message.windowId
          ? await db.getTabsByWindow(message.windowId)
          : await db.getAllTabs();

        sendResponse({ projects, tabs });
        return;
      }

      sendResponse({ success: false, error: 'Unknown message type' });
    } catch (error) {
      console.error('Error handling message:', error);
      sendResponse({ success: false, error: String(error) });
    }
  })();

  return true;
});

async function handleUIAction(action: UIAction): Promise<void> {
  const db = await getDB();

  switch (action.action) {
    case 'activate_tab':
      if (action.tabId) {
        await chrome.tabs.update(action.tabId, { active: true });
      }
      break;

    case 'close_tab':
      if (action.tabId) {
        await chrome.tabs.remove(action.tabId);
      }
      break;

    case 'pin_tab':
      if (action.tabId) {
        const tab = await chrome.tabs.get(action.tabId);
        await chrome.tabs.update(action.tabId, { pinned: !tab.pinned });
      }
      break;

    case 'mute_tab':
      if (action.tabId) {
        const tab = await chrome.tabs.get(action.tabId);
        await chrome.tabs.update(action.tabId, { muted: !tab.mutedInfo?.muted });
      }
      break;

    case 'move_tab_to_project':
      if (action.tabId && action.projectId) {
        const tab = await db.getTab(action.tabId);
        if (tab) {
          tab.projectId = action.projectId;
          tab.subprojectId = action.subprojectId;
          tab.manuallyAssigned = true;
          await db.putTab(tab);
        }
      }
      break;

    case 'rename_project':
      if (action.projectId && action.value) {
        const project = await db.getProject(action.projectId);
        if (project) {
          project.name = action.value;
          await db.putProject(project);
        }
      }
      break;

    case 'pin_project':
      if (action.projectId) {
        const project = await db.getProject(action.projectId);
        if (project) {
          project.pinned = !project.pinned;
          await db.putProject(project);
        }
      }
      break;

    case 'lock_project':
      if (action.projectId) {
        const project = await db.getProject(action.projectId);
        if (project) {
          project.locked = !project.locked;
          await db.putProject(project);
        }
      }
      break;

    case 'delete_project':
      if (action.projectId) {
        await db.deleteProject(action.projectId);

        const tabs = await db.getTabsByProject(action.projectId);
        for (const tab of tabs) {
          tab.projectId = undefined;
          tab.subprojectId = undefined;
          await db.putTab(tab);
        }
      }
      break;
  }

  broadcastUpdate({ type: 'TAB_UPDATED', data: action });
}

function broadcastUpdate(message: RuntimeMessage): void {
  chrome.runtime.sendMessage(message).catch(() => {});
}

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'cleanup') {
    try {
      const db = await getDB();
      await db.clearExpiredCache();
    } catch (error) {
      console.error('Cleanup error:', error);
    }
  }
});
