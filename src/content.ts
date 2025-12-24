/**
 * Content script: Shadow DOM injection and page signal extraction
 */

import type { PageSignals, RuntimeMessage } from './types.js';

if (document.location.protocol !== 'chrome:' && document.location.protocol !== 'chrome-extension:') {
  const host = document.createElement('div');
  host.id = '__proj_rail__';
  host.style.cssText = `
    all: initial;
    position: fixed;
    top: 0;
    bottom: 0;
    right: 0;
    z-index: 2147483647;
    pointer-events: none;
  `;

  const shadow = host.attachShadow({ mode: 'open' });

  const style = document.createElement('style');
  style.textContent = `
    :host {
      all: initial;
      display: block;
    }

    .rail-container {
      position: fixed;
      top: 0;
      bottom: 0;
      right: 0;
      display: flex;
      flex-direction: row;
      pointer-events: none;
      transition: width 0.2s ease;
    }

    .rail-container.left {
      left: 0;
      right: auto;
    }

    .rail-handle {
      width: var(--rail-width, 12px);
      height: 100vh;
      background: linear-gradient(90deg, rgba(0,0,0,0.05) 0%, rgba(0,0,0,0.08) 100%);
      border-left: 1px solid rgba(0,0,0,0.1);
      cursor: pointer;
      pointer-events: auto;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.2s ease;
    }

    .rail-handle:hover {
      background: linear-gradient(90deg, rgba(0,0,0,0.08) 0%, rgba(0,0,0,0.12) 100%);
    }

    .rail-handle .indicator {
      width: 4px;
      height: 24px;
      border-radius: 2px;
      background: var(--project-color, #3b82f6);
      opacity: 0.6;
    }

    .rail-panel {
      width: 0;
      height: 100vh;
      background: #1a1a1a;
      color: #ffffff;
      overflow: hidden;
      pointer-events: auto;
      box-shadow: -2px 0 8px rgba(0,0,0,0.3);
      transition: width 0.2s ease;
    }

    .rail-container.expanded .rail-panel {
      width: var(--panel-width, 320px);
    }

    .panel-content {
      width: var(--panel-width, 320px);
      height: 100%;
      overflow-y: auto;
      overflow-x: hidden;
      padding: 12px;
    }

    .panel-content::-webkit-scrollbar {
      width: 8px;
    }

    .panel-content::-webkit-scrollbar-track {
      background: #2a2a2a;
    }

    .panel-content::-webkit-scrollbar-thumb {
      background: #444;
      border-radius: 4px;
    }

    .panel-content::-webkit-scrollbar-thumb:hover {
      background: #555;
    }

    .loading {
      padding: 24px;
      text-align: center;
      color: #999;
      font-family: system-ui, -apple-system, sans-serif;
      font-size: 13px;
    }
  `;

  shadow.appendChild(style);

  const container = document.createElement('div');
  container.className = 'rail-container';
  container.innerHTML = `
    <div class="rail-handle">
      <div class="indicator"></div>
    </div>
    <div class="rail-panel">
      <div class="panel-content">
        <div class="loading">Loading projects...</div>
      </div>
    </div>
  `;

  shadow.appendChild(container);

  const railHandle = shadow.querySelector('.rail-handle') as HTMLElement;
  const railPanel = shadow.querySelector('.rail-panel') as HTMLElement;
  let isPinned = false;

  railHandle.addEventListener('mouseenter', () => {
    if (!isPinned) {
      container.classList.add('expanded');
    }
  });

  container.addEventListener('mouseleave', () => {
    if (!isPinned) {
      container.classList.remove('expanded');
    }
  });

  railHandle.addEventListener('click', () => {
    isPinned = !isPinned;
    container.classList.toggle('expanded', isPinned);
  });

  function injectHost() {
    if (!document.documentElement.contains(host)) {
      document.documentElement.appendChild(host);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectHost);
  } else {
    injectHost();
  }

  const observer = new MutationObserver(() => {
    if (!document.documentElement.contains(host)) {
      injectHost();
    }
  });

  observer.observe(document.documentElement, { childList: true, subtree: false });

  function extractSignals(): PageSignals {
    const h1 = document.querySelector('h1')?.innerText?.slice(0, 160) || undefined;
    const meta = document.querySelector('meta[name="description"]')?.getAttribute('content')?.slice(0, 200) || undefined;
    const ogTitle = document.querySelector('meta[property="og:title"]')?.getAttribute('content')?.slice(0, 200) || undefined;

    return {
      h1,
      metaDescription: meta,
      ogTitle,
      extractedAt: Date.now(),
    };
  }

  function sendSignals() {
    const signals = extractSignals();
    const message: RuntimeMessage = {
      type: 'PAGE_SIGNALS',
      signals,
    };

    chrome.runtime.sendMessage(message).catch(() => {});
  }

  if (document.readyState === 'complete') {
    setTimeout(sendSignals, 500);
  } else {
    window.addEventListener('load', () => {
      setTimeout(sendSignals, 500);
    });
  }

  const script = document.createElement('script');
  script.src = chrome.runtime.getURL('dist/rail.js');
  script.type = 'module';
  shadow.appendChild(script);

  (window as any).__projectRailShadow = shadow;
}
