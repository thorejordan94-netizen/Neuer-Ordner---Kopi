/**
 * Rail UI component: renders project tree and tab list
 */

import type { Project, TabMeta, RuntimeMessage, UIAction } from '../types.js';

class RailUI {
  private shadow: ShadowRoot | null = null;
  private projects: Project[] = [];
  private tabs: TabMeta[] = [];
  private expandedProjects = new Set<string>();

  async init() {
    this.shadow = (window as any).__projectRailShadow;
    if (!this.shadow) {
      console.error('Shadow root not found');
      return;
    }

    await this.loadState();
    this.render();
    this.setupListeners();
  }

  private async loadState() {
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'GET_STATE',
        windowId: (await chrome.windows.getCurrent()).id,
      });

      this.projects = response.projects || [];
      this.tabs = response.tabs || [];

      this.projects.sort((a, b) => {
        if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
        return b.lastActiveAt - a.lastActiveAt;
      });
    } catch (error) {
      console.error('Failed to load state:', error);
    }
  }

  private setupListeners() {
    chrome.runtime.onMessage.addListener((message: RuntimeMessage) => {
      if (message.type === 'CONTEXT_UPDATED' || message.type === 'TAB_UPDATED') {
        this.loadState().then(() => this.render());
      }
    });
  }

  private render() {
    if (!this.shadow) return;

    const content = this.shadow.querySelector('.panel-content');
    if (!content) return;

    if (this.projects.length === 0) {
      content.innerHTML = `
        <div class="loading">
          No projects yet.<br>
          Open some tabs to get started!
        </div>
      `;
      return;
    }

    const html = this.projects.map(project => this.renderProject(project)).join('');

    content.innerHTML = `
      <style>
        .project {
          margin-bottom: 16px;
          border-radius: 6px;
          overflow: hidden;
          background: #2a2a2a;
        }

        .project-header {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 10px 12px;
          cursor: pointer;
          user-select: none;
          transition: background 0.15s;
        }

        .project-header:hover {
          background: #333;
        }

        .project-color {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          flex-shrink: 0;
        }

        .project-name {
          flex: 1;
          font-family: system-ui, -apple-system, sans-serif;
          font-size: 13px;
          font-weight: 500;
          color: #fff;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .project-count {
          font-size: 11px;
          color: #999;
          background: #1a1a1a;
          padding: 2px 6px;
          border-radius: 10px;
        }

        .project-pinned {
          color: #f59e0b;
          font-size: 12px;
        }

        .project-tabs {
          max-height: 0;
          overflow: hidden;
          transition: max-height 0.2s ease;
        }

        .project.expanded .project-tabs {
          max-height: 1000px;
        }

        .tab-item {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 8px 12px 8px 28px;
          cursor: pointer;
          transition: background 0.15s;
          border-left: 2px solid transparent;
        }

        .tab-item:hover {
          background: #333;
          border-left-color: currentColor;
        }

        .tab-item.active {
          background: #2563eb22;
          border-left-color: #2563eb;
        }

        .tab-favicon {
          width: 16px;
          height: 16px;
          flex-shrink: 0;
          border-radius: 2px;
        }

        .tab-title {
          flex: 1;
          font-family: system-ui, -apple-system, sans-serif;
          font-size: 12px;
          color: #ddd;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .tab-close {
          opacity: 0;
          color: #999;
          font-size: 16px;
          line-height: 1;
          padding: 2px 4px;
          border-radius: 2px;
          transition: all 0.15s;
        }

        .tab-item:hover .tab-close {
          opacity: 1;
        }

        .tab-close:hover {
          background: #444;
          color: #fff;
        }

        .empty {
          padding: 12px 12px 12px 28px;
          font-size: 11px;
          color: #666;
          font-style: italic;
        }
      </style>
      ${html}
    `;

    this.attachEventHandlers();
  }

  private renderProject(project: Project): string {
    const projectTabs = this.tabs.filter(t => t.projectId === project.projectId);
    const isExpanded = this.expandedProjects.has(project.projectId);

    return `
      <div class="project ${isExpanded ? 'expanded' : ''}" data-project-id="${project.projectId}">
        <div class="project-header" data-action="toggle-project">
          <div class="project-color" style="background: ${project.color}"></div>
          <div class="project-name">${this.escapeHtml(project.name)}</div>
          <div class="project-count">${projectTabs.length}</div>
          ${project.pinned ? '<div class="project-pinned">📌</div>' : ''}
        </div>
        <div class="project-tabs">
          ${projectTabs.length > 0 ? projectTabs.map(tab => this.renderTab(tab, project.color)).join('') : '<div class="empty">No tabs</div>'}
        </div>
      </div>
    `;
  }

  private renderTab(tab: TabMeta, projectColor: string): string {
    const favicon = `chrome-extension://${chrome.runtime.id}/_favicon/?pageUrl=${encodeURIComponent(tab.url)}&size=16`;

    return `
      <div class="tab-item" data-tab-id="${tab.tabId}" style="color: ${projectColor}">
        <img class="tab-favicon" src="${favicon}" onerror="this.style.display='none'">
        <div class="tab-title">${this.escapeHtml(tab.title || tab.url)}</div>
        <div class="tab-close" data-action="close-tab">×</div>
      </div>
    `;
  }

  private attachEventHandlers() {
    if (!this.shadow) return;

    const content = this.shadow.querySelector('.panel-content');
    if (!content) return;

    content.addEventListener('click', async (e) => {
      const target = e.target as HTMLElement;

      const projectHeader = target.closest('[data-action="toggle-project"]');
      if (projectHeader) {
        const projectEl = projectHeader.closest('[data-project-id]') as HTMLElement;
        const projectId = projectEl?.dataset.projectId;
        if (projectId) {
          this.toggleProject(projectId);
        }
        return;
      }

      const closeBtn = target.closest('[data-action="close-tab"]');
      if (closeBtn) {
        e.stopPropagation();
        const tabItem = closeBtn.closest('[data-tab-id]') as HTMLElement;
        const tabId = tabItem?.dataset.tabId;
        if (tabId) {
          await this.sendAction({ action: 'close_tab', tabId: parseInt(tabId) });
        }
        return;
      }

      const tabItem = target.closest('[data-tab-id]') as HTMLElement;
      if (tabItem) {
        const tabId = tabItem.dataset.tabId;
        if (tabId) {
          await this.sendAction({ action: 'activate_tab', tabId: parseInt(tabId) });
        }
        return;
      }
    });
  }

  private toggleProject(projectId: string) {
    if (this.expandedProjects.has(projectId)) {
      this.expandedProjects.delete(projectId);
    } else {
      this.expandedProjects.add(projectId);
    }
    this.render();
  }

  private async sendAction(action: UIAction) {
    try {
      await chrome.runtime.sendMessage({
        type: 'UI_ACTION',
        action,
      });
    } catch (error) {
      console.error('Failed to send action:', error);
    }
  }

  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

const ui = new RailUI();
ui.init();
