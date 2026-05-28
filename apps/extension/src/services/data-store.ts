import type { DataPackageManifest, DataPackageVersionState } from "../shared/types";

export interface DataPackageStore {
  readVersionState(): Promise<DataPackageVersionState>;
  setVersionState(state: DataPackageVersionState): Promise<void>;
  writeManifest(dataVersion: string, manifest: DataPackageManifest): Promise<void>;
  readManifest(dataVersion: string): Promise<DataPackageManifest | undefined>;
  writeFile(dataVersion: string, path: string, content: string): Promise<void>;
  readFile(dataVersion: string, path: string): Promise<string | undefined>;
  activateVersion(dataVersion: string, manifestUrl: string): Promise<void>;
  rollback(): Promise<void>;
  resetToBundledSnapshot(): Promise<void>;
}

const DB_NAME = "world-cup-copilot-data";
const DB_VERSION = 1;
const STATE_KEY = "version-state";

export class MemoryDataPackageStore implements DataPackageStore {
  private state: DataPackageVersionState = {};
  private manifests = new Map<string, DataPackageManifest>();
  private files = new Map<string, string>();

  async readVersionState(): Promise<DataPackageVersionState> {
    return { ...this.state };
  }

  async setVersionState(state: DataPackageVersionState): Promise<void> {
    this.state = { ...state };
  }

  async writeManifest(dataVersion: string, manifest: DataPackageManifest): Promise<void> {
    this.manifests.set(dataVersion, manifest);
  }

  async readManifest(dataVersion: string): Promise<DataPackageManifest | undefined> {
    return this.manifests.get(dataVersion);
  }

  async writeFile(dataVersion: string, path: string, content: string): Promise<void> {
    this.files.set(fileKey(dataVersion, path), content);
  }

  async readFile(dataVersion: string, path: string): Promise<string | undefined> {
    return this.files.get(fileKey(dataVersion, path));
  }

  async activateVersion(dataVersion: string, manifestUrl: string): Promise<void> {
    this.state = {
      ...this.state,
      activeDataVersion: dataVersion,
      previousDataVersion: this.state.activeDataVersion,
      pendingDataVersion: undefined,
      manifestUrl,
      lastPulledAt: new Date().toISOString()
    };
  }

  async rollback(): Promise<void> {
    if (!this.state.previousDataVersion) return;
    const currentActive = this.state.activeDataVersion;
    this.state = {
      ...this.state,
      activeDataVersion: this.state.previousDataVersion,
      previousDataVersion: currentActive
    };
  }

  async resetToBundledSnapshot(): Promise<void> {
    this.state = {
      ...this.state,
      activeDataVersion: undefined,
      previousDataVersion: this.state.activeDataVersion,
      pendingDataVersion: undefined
    };
  }
}

export class IndexedDbDataPackageStore implements DataPackageStore {
  async readVersionState(): Promise<DataPackageVersionState> {
    return (await this.get<DataPackageVersionState>("state", STATE_KEY)) ?? {};
  }

  async setVersionState(state: DataPackageVersionState): Promise<void> {
    await this.put("state", state, STATE_KEY);
  }

  async writeManifest(dataVersion: string, manifest: DataPackageManifest): Promise<void> {
    await this.put("manifests", manifest, dataVersion);
  }

  async readManifest(dataVersion: string): Promise<DataPackageManifest | undefined> {
    return this.get<DataPackageManifest>("manifests", dataVersion);
  }

  async writeFile(dataVersion: string, path: string, content: string): Promise<void> {
    await this.put("files", { dataVersion, path, content }, fileKey(dataVersion, path));
  }

  async readFile(dataVersion: string, path: string): Promise<string | undefined> {
    return (await this.get<{ content: string }>("files", fileKey(dataVersion, path)))?.content;
  }

  async activateVersion(dataVersion: string, manifestUrl: string): Promise<void> {
    const state = await this.readVersionState();
    await this.setVersionState({
      ...state,
      activeDataVersion: dataVersion,
      previousDataVersion: state.activeDataVersion,
      pendingDataVersion: undefined,
      manifestUrl,
      lastPulledAt: new Date().toISOString()
    });
  }

  async rollback(): Promise<void> {
    const state = await this.readVersionState();
    if (!state.previousDataVersion) return;
    await this.setVersionState({
      ...state,
      activeDataVersion: state.previousDataVersion,
      previousDataVersion: state.activeDataVersion
    });
  }

  async resetToBundledSnapshot(): Promise<void> {
    const state = await this.readVersionState();
    await this.setVersionState({
      ...state,
      activeDataVersion: undefined,
      previousDataVersion: state.activeDataVersion,
      pendingDataVersion: undefined
    });
  }

  private async get<T>(storeName: string, key: string): Promise<T | undefined> {
    const db = await openDatabase();
    return requestToPromise<T | undefined>(db.transaction(storeName, "readonly").objectStore(storeName).get(key));
  }

  private async put<T>(storeName: string, value: T, key: string): Promise<void> {
    const db = await openDatabase();
    const transaction = db.transaction(storeName, "readwrite");
    transaction.objectStore(storeName).put(value, key);
    await transactionToPromise(transaction);
  }
}

function fileKey(dataVersion: string, path: string): string {
  return `${dataVersion}:${path}`;
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      for (const storeName of ["state", "manifests", "files"]) {
        if (!db.objectStoreNames.contains(storeName)) db.createObjectStore(storeName);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function transactionToPromise(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}
