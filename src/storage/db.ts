/**
 * IndexedDB wrapper for scalable tab and project metadata storage
 */

import type { TabMeta, Project } from '../types.js';

const DB_NAME = 'ProjectRailDB';
const DB_VERSION = 1;

export class ProjectDB {
  private db: IDBDatabase | null = null;

  async open(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        if (!db.objectStoreNames.contains('tabs')) {
          const tabStore = db.createObjectStore('tabs', { keyPath: 'tabId' });
          tabStore.createIndex('projectId', 'projectId', { unique: false });
          tabStore.createIndex('host', 'host', { unique: false });
          tabStore.createIndex('lastActiveAt', 'lastActiveAt', { unique: false });
          tabStore.createIndex('windowId', 'windowId', { unique: false });
        }

        if (!db.objectStoreNames.contains('projects')) {
          const projectStore = db.createObjectStore('projects', { keyPath: 'projectId' });
          projectStore.createIndex('lastActiveAt', 'lastActiveAt', { unique: false });
          projectStore.createIndex('pinned', 'pinned', { unique: false });
        }

        if (!db.objectStoreNames.contains('cache')) {
          db.createObjectStore('cache', { keyPath: 'key' });
        }
      };
    });
  }

  private ensureDB(): IDBDatabase {
    if (!this.db) throw new Error('Database not opened');
    return this.db;
  }

  async putTab(tab: TabMeta): Promise<void> {
    const db = this.ensureDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('tabs', 'readwrite');
      const request = tx.objectStore('tabs').put(tab);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async getTab(tabId: number): Promise<TabMeta | null> {
    const db = this.ensureDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('tabs', 'readonly');
      const request = tx.objectStore('tabs').get(tabId);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }

  async deleteTab(tabId: number): Promise<void> {
    const db = this.ensureDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('tabs', 'readwrite');
      const request = tx.objectStore('tabs').delete(tabId);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async getAllTabs(): Promise<TabMeta[]> {
    const db = this.ensureDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('tabs', 'readonly');
      const request = tx.objectStore('tabs').getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async getTabsByProject(projectId: string): Promise<TabMeta[]> {
    const db = this.ensureDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('tabs', 'readonly');
      const index = tx.objectStore('tabs').index('projectId');
      const request = index.getAll(projectId);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async getTabsByHost(host: string): Promise<TabMeta[]> {
    const db = this.ensureDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('tabs', 'readonly');
      const index = tx.objectStore('tabs').index('host');
      const request = index.getAll(host);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async getTabsByWindow(windowId: number): Promise<TabMeta[]> {
    const db = this.ensureDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('tabs', 'readonly');
      const index = tx.objectStore('tabs').index('windowId');
      const request = index.getAll(windowId);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async putProject(project: Project): Promise<void> {
    const db = this.ensureDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('projects', 'readwrite');
      const request = tx.objectStore('projects').put(project);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async getProject(projectId: string): Promise<Project | null> {
    const db = this.ensureDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('projects', 'readonly');
      const request = tx.objectStore('projects').get(projectId);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }

  async getAllProjects(): Promise<Project[]> {
    const db = this.ensureDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('projects', 'readonly');
      const request = tx.objectStore('projects').getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async deleteProject(projectId: string): Promise<void> {
    const db = this.ensureDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('projects', 'readwrite');
      const request = tx.objectStore('projects').delete(projectId);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async putCache(key: string, value: any, ttl?: number): Promise<void> {
    const db = this.ensureDB();
    const expiresAt = ttl ? Date.now() + ttl : undefined;
    return new Promise((resolve, reject) => {
      const tx = db.transaction('cache', 'readwrite');
      const request = tx.objectStore('cache').put({ key, value, expiresAt });
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async getCache<T>(key: string): Promise<T | null> {
    const db = this.ensureDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('cache', 'readonly');
      const request = tx.objectStore('cache').get(key);
      request.onsuccess = () => {
        const result = request.result;
        if (!result) {
          resolve(null);
          return;
        }
        if (result.expiresAt && result.expiresAt < Date.now()) {
          this.deleteCache(key);
          resolve(null);
          return;
        }
        resolve(result.value);
      };
      request.onerror = () => reject(request.error);
    });
  }

  async deleteCache(key: string): Promise<void> {
    const db = this.ensureDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('cache', 'readwrite');
      const request = tx.objectStore('cache').delete(key);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async clearExpiredCache(): Promise<void> {
    const db = this.ensureDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('cache', 'readwrite');
      const store = tx.objectStore('cache');
      const request = store.openCursor();

      request.onsuccess = () => {
        const cursor = request.result;
        if (cursor) {
          if (cursor.value.expiresAt && cursor.value.expiresAt < Date.now()) {
            cursor.delete();
          }
          cursor.continue();
        } else {
          resolve();
        }
      };
      request.onerror = () => reject(request.error);
    });
  }
}

let dbInstance: ProjectDB | null = null;

export async function getDB(): Promise<ProjectDB> {
  if (!dbInstance) {
    dbInstance = new ProjectDB();
    await dbInstance.open();
  }
  return dbInstance;
}
