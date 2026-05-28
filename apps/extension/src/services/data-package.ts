import type {
  DataPackageDownloadTier,
  DataPackageFile,
  DataPackageFileIndexContent,
  DataPackageManifest,
  DataPackageManifestSummary,
  DataPackageTierSummary
} from "../shared/types";
import type { DataPackageStore } from "./data-store";

const SUPPORTED_SCHEMA_MAJOR = "1";
const CORE_REQUIRED_PATHS = [
  "data/metadata/coverage.json",
  "data/sources/sources.json",
  "data/taxonomy/teams.json",
  "data/taxonomy/team-aliases.json",
  "data/taxonomy/team-quality.json",
  "data/taxonomy/venues.json",
  "data/schedule/worldcup-2026.json",
  "data/history/international-results-index.json"
];

export interface ValidationResult {
  ok: boolean;
  errors: string[];
}

export interface PullDataPackageOptions {
  manifestUrl: string;
  tiers: DataPackageDownloadTier[];
  store: DataPackageStore;
  fetchFn?: typeof fetch;
  onProgress?: (progress: PullDataPackageProgress) => void;
}

export interface PullDataPackageResult {
  dataVersion: string;
  downloadedFiles: number;
  totalBytes: number;
}

export interface PullDataPackageProgress {
  dataVersion: string;
  totalFiles: number;
  checkedFiles: number;
  downloadedFiles: number;
  skippedFiles: number;
  downloadedBytes: number;
  currentPath?: string;
}

export interface CheckDataPackageManifestOptions {
  manifestUrl: string;
  store: DataPackageStore;
  fetchFn?: typeof fetch;
}

export interface CheckDataPackageManifestResult {
  manifest: DataPackageManifest;
  summary: DataPackageManifestSummary;
}

export interface EnsureDataPackageFilesOptions {
  paths: string[];
  store: DataPackageStore;
  fetchFn?: typeof fetch;
}

export interface EnsureCoreDataPackageOptions {
  manifestUrl: string;
  store: DataPackageStore;
  fetchFn?: typeof fetch;
}

export function validateDataPackageManifest(manifest: DataPackageManifest): ValidationResult {
  const errors: string[] = [];
  if (!manifest || typeof manifest !== "object") {
    return { ok: false, errors: ["manifest must be an object"] };
  }
  if (!manifest.schemaVersion?.startsWith(`${SUPPORTED_SCHEMA_MAJOR}.`)) {
    errors.push(`unsupported schemaVersion ${manifest.schemaVersion ?? "<missing>"}`);
  }
  for (const key of ["dataVersion", "generatedAt", "gitCommit"] as const) {
    if (!manifest[key]) errors.push(`manifest.${key} is required`);
  }
  if (!Array.isArray(manifest.files)) {
    errors.push("manifest.files must be an array");
  }

  const byPath = new Map((manifest.files ?? []).map((file) => [file.path, file]));
  for (const requiredPath of CORE_REQUIRED_PATHS) {
    const file = byPath.get(requiredPath);
    if (!file) {
      errors.push(`missing required core file ${requiredPath}`);
    } else if (!file.required || file.downloadTier !== "core") {
      errors.push(`${requiredPath} must be required and downloadTier=core`);
    }
  }

  for (const file of manifest.files ?? []) {
    validateManifestFile(file, errors);
  }
  for (const file of manifest.fileIndexes ?? []) {
    validateManifestFile(file, errors);
    if (!file.indexesTier) errors.push(`${file.path} missing indexesTier`);
    if (!Array.isArray(file.pathPrefixes)) errors.push(`${file.path} missing pathPrefixes`);
  }

  return { ok: errors.length === 0, errors };
}

export function selectManifestFiles(
  manifest: DataPackageManifest,
  tiers: DataPackageDownloadTier[]
): DataPackageFile[] {
  const selectedTiers = new Set(tiers);
  return manifest.files
    .filter((file) => file.required || selectedTiers.has(file.downloadTier))
    .sort((a, b) => a.path.localeCompare(b.path));
}

export function mergeManifestFiles(
  manifest: DataPackageManifest,
  files: DataPackageFile[]
): DataPackageManifest {
  const byPath = new Map(manifest.files.map((file) => [file.path, file]));
  for (const file of files) byPath.set(file.path, file);
  return {
    ...manifest,
    files: [...byPath.values()].sort((a, b) => a.path.localeCompare(b.path))
  };
}

export function summarizeDataPackageManifest(manifest: DataPackageManifest): DataPackageManifestSummary {
  const emptyTierSummary = (): Record<DataPackageDownloadTier, DataPackageTierSummary> => ({
    core: { files: 0, bytes: 0 },
    "match-context": { files: 0, bytes: 0 },
    "tournament-context": { files: 0, bytes: 0 },
    "player-context": { files: 0, bytes: 0 },
    audit: { files: 0, bytes: 0 },
    optional: { files: 0, bytes: 0 }
  });
  const byTier = emptyTierSummary();
  const byCategory: Record<string, DataPackageTierSummary> = {};
  let totalBytes = 0;
  let requiredFiles = 0;
  let requiredBytes = 0;

  for (const file of manifest.files) {
    totalBytes += file.sizeBytes;
    byTier[file.downloadTier].files += 1;
    byTier[file.downloadTier].bytes += file.sizeBytes;
    byCategory[file.category] ??= { files: 0, bytes: 0 };
    byCategory[file.category].files += 1;
    byCategory[file.category].bytes += file.sizeBytes;
    if (file.required) {
      requiredFiles += 1;
      requiredBytes += file.sizeBytes;
    }
  }

  return {
    dataVersion: manifest.dataVersion,
    generatedAt: manifest.generatedAt,
    gitCommit: manifest.gitCommit,
    license: manifest.license,
    fileCount: manifest.files.length,
    totalBytes,
    requiredFiles,
    requiredBytes,
    byTier,
    byCategory
  };
}

export async function verifyDataPackageFile(file: DataPackageFile, content: string): Promise<void> {
  const sizeBytes = new TextEncoder().encode(content).byteLength;
  if (sizeBytes !== file.sizeBytes) {
    throw new Error(`${file.path} size mismatch: expected ${file.sizeBytes}, got ${sizeBytes}`);
  }
  const hash = await sha256Text(content);
  if (hash !== file.sha256) {
    throw new Error(`${file.path} sha256 mismatch: expected ${file.sha256}, got ${hash}`);
  }
}

export function buildFileUrl(manifestUrl: string, filePath: string): string {
  return new URL(filePath, manifestUrl).toString();
}

export async function fetchDataPackageManifest(
  manifestUrl: string,
  fetchFn: typeof fetch = fetch
): Promise<DataPackageManifest> {
  const response = await fetchFn(manifestUrl);
  if (!response.ok) throw new Error(`manifest fetch failed: HTTP ${response.status}`);
  return (await response.json()) as DataPackageManifest;
}

export async function checkDataPackageManifest(
  options: CheckDataPackageManifestOptions
): Promise<CheckDataPackageManifestResult> {
  const fetchFn = options.fetchFn ?? fetch;
  const manifest = await fetchDataPackageManifest(options.manifestUrl, fetchFn);
  const validation = validateDataPackageManifest(manifest);
  if (!validation.ok) {
    throw new Error(`Invalid data package manifest:\n${validation.errors.join("\n")}`);
  }

  const currentState = await options.store.readVersionState();
  await options.store.setVersionState({
    ...currentState,
    manifestUrl: options.manifestUrl,
    lastCheckedAt: new Date().toISOString()
  });
  await options.store.writeManifest(manifest.dataVersion, manifest);

  return {
    manifest,
    summary: summarizeDataPackageManifest(manifest)
  };
}

export async function pullDataPackage(options: PullDataPackageOptions): Promise<PullDataPackageResult> {
  const fetchFn = options.fetchFn ?? fetch;
  let manifest = await fetchDataPackageManifest(options.manifestUrl, fetchFn);
  const validation = validateDataPackageManifest(manifest);
  if (!validation.ok) {
    throw new Error(`Invalid data package manifest:\n${validation.errors.join("\n")}`);
  }
  manifest = await loadManifestIndexesForTiers(manifest, options.manifestUrl, options.tiers, fetchFn);

  const files = selectManifestFiles(manifest, options.tiers);
  const currentState = await options.store.readVersionState();
  await options.store.setVersionState({
    ...currentState,
    pendingDataVersion: manifest.dataVersion,
    manifestUrl: options.manifestUrl,
    lastCheckedAt: new Date().toISOString()
  });
  await options.store.writeManifest(manifest.dataVersion, manifest);

  let downloadedFiles = 0;
  let totalBytes = 0;
  let checkedFiles = 0;
  let skippedFiles = 0;
  const reportProgress = (currentPath?: string) =>
    options.onProgress?.({
      dataVersion: manifest.dataVersion,
      totalFiles: files.length,
      checkedFiles,
      downloadedFiles,
      skippedFiles,
      downloadedBytes: totalBytes,
      currentPath
    });
  try {
    reportProgress();
    for (const file of files) {
      checkedFiles += 1;
      if (await options.store.readFile(manifest.dataVersion, file.path)) {
        skippedFiles += 1;
        if (checkedFiles % 100 === 0 || checkedFiles === files.length) reportProgress(file.path);
        continue;
      }
      const response = await fetchFn(buildFileUrl(options.manifestUrl, file.path));
      if (!response.ok) throw new Error(`${file.path} fetch failed: HTTP ${response.status}`);
      const content = await response.text();
      await verifyDataPackageFile(file, content);
      await options.store.writeFile(manifest.dataVersion, file.path, content);
      downloadedFiles += 1;
      totalBytes += file.sizeBytes;
      if (downloadedFiles % 10 === 0 || checkedFiles === files.length) reportProgress(file.path);
    }
    await options.store.activateVersion(manifest.dataVersion, options.manifestUrl);
  } catch (error) {
    await options.store.setVersionState(currentState);
    throw error;
  }

  return {
    dataVersion: manifest.dataVersion,
    downloadedFiles,
    totalBytes
  };
}

export async function ensureCoreDataPackage(options: EnsureCoreDataPackageOptions): Promise<PullDataPackageResult> {
  const fetchFn = options.fetchFn ?? fetch;
  const manifest = await fetchDataPackageManifest(options.manifestUrl, fetchFn);
  const validation = validateDataPackageManifest(manifest);
  if (!validation.ok) {
    throw new Error(`Invalid data package manifest:\n${validation.errors.join("\n")}`);
  }

  const currentState = await options.store.readVersionState();
  await options.store.setVersionState({
    ...currentState,
    manifestUrl: options.manifestUrl,
    lastCheckedAt: new Date().toISOString()
  });
  await options.store.writeManifest(manifest.dataVersion, manifest);

  if (
    currentState.activeDataVersion === manifest.dataVersion &&
    (await hasAllFiles(options.store, manifest.dataVersion, selectManifestFiles(manifest, ["core"])))
  ) {
    return {
      dataVersion: manifest.dataVersion,
      downloadedFiles: 0,
      totalBytes: 0
    };
  }

  return pullDataPackage({
    manifestUrl: options.manifestUrl,
    tiers: ["core"],
    store: options.store,
    fetchFn
  });
}

export async function ensureDataPackageFiles(
  options: EnsureDataPackageFilesOptions
): Promise<PullDataPackageResult> {
  const fetchFn = options.fetchFn ?? fetch;
  const state = await options.store.readVersionState();
  if (!state.activeDataVersion || !state.manifestUrl) {
    return { dataVersion: "", downloadedFiles: 0, totalBytes: 0 };
  }

  const manifestContent = await options.store.readManifest(state.activeDataVersion);
  if (!manifestContent) {
    return { dataVersion: state.activeDataVersion, downloadedFiles: 0, totalBytes: 0 };
  }
  let manifest = manifestContent;
  let fileByPath = new Map(manifest.files.map((file) => [file.path, file]));
  const missingPaths = options.paths.filter((path) => !fileByPath.has(path));
  if (missingPaths.length) {
    manifest = await loadManifestIndexesForPaths(manifest, state.manifestUrl, missingPaths, fetchFn);
    await options.store.writeManifest(state.activeDataVersion, manifest);
    fileByPath = new Map(manifest.files.map((file) => [file.path, file]));
  }
  let downloadedFiles = 0;
  let totalBytes = 0;

  for (const path of options.paths) {
    if (await options.store.readFile(state.activeDataVersion, path)) continue;
    const file = fileByPath.get(path);
    if (!file) continue;
    const response = await fetchFn(buildFileUrl(state.manifestUrl, path));
    if (!response.ok) throw new Error(`${path} fetch failed: HTTP ${response.status}`);
    const content = await response.text();
    await verifyDataPackageFile(file, content);
    await options.store.writeFile(state.activeDataVersion, path, content);
    downloadedFiles += 1;
    totalBytes += file.sizeBytes;
  }

  return {
    dataVersion: state.activeDataVersion,
    downloadedFiles,
    totalBytes
  };
}

async function loadManifestIndexesForTiers(
  manifest: DataPackageManifest,
  manifestUrl: string,
  tiers: DataPackageDownloadTier[],
  fetchFn: typeof fetch
): Promise<DataPackageManifest> {
  const selectedTiers = new Set(tiers.filter((tier) => tier !== "core"));
  if (!selectedTiers.size) return manifest;
  const files = await fetchManifestIndexFiles(manifest, manifestUrl, selectedTiers, fetchFn);
  return mergeManifestFiles(manifest, files);
}

async function loadManifestIndexesForPaths(
  manifest: DataPackageManifest,
  manifestUrl: string,
  paths: string[],
  fetchFn: typeof fetch
): Promise<DataPackageManifest> {
  const filesByPath = new Map(manifest.files.map((file) => [file.path, file]));
  if (paths.every((path) => filesByPath.has(path))) return manifest;
  const files = await fetchManifestIndexFiles(manifest, manifestUrl, indexesForPaths(manifest, paths), fetchFn, paths);
  return mergeManifestFiles(manifest, files);
}

async function fetchManifestIndexFiles(
  manifest: DataPackageManifest,
  manifestUrl: string,
  tiers: Set<DataPackageDownloadTier>,
  fetchFn: typeof fetch,
  paths?: string[]
): Promise<DataPackageFile[]> {
  const files: DataPackageFile[] = [];
  for (const index of manifest.fileIndexes ?? []) {
    if (!tiers.has(index.indexesTier)) continue;
    const pathPrefixes = index.pathPrefixes ?? [];
    if (paths && pathPrefixes.length && !paths.some((path) => pathPrefixes.some((prefix) => path.startsWith(prefix)))) {
      continue;
    }
    const response = await fetchFn(buildFileUrl(manifestUrl, index.path));
    if (!response.ok) throw new Error(`${index.path} fetch failed: HTTP ${response.status}`);
    const content = await response.text();
    await verifyDataPackageFile(index, content);
    const parsed = JSON.parse(content) as DataPackageFileIndexContent;
    files.push(...expandIndexedFiles(parsed));
  }
  return files;
}

function expandIndexedFiles(indexContent: DataPackageFileIndexContent): DataPackageFile[] {
  return (indexContent.files ?? []).map((file) => ({
    ...indexContent.fileDefaults,
    ...file
  })) as DataPackageFile[];
}

function indexesForPaths(
  manifest: DataPackageManifest,
  paths: string[]
): Set<DataPackageDownloadTier> {
  const tiers = new Set<DataPackageDownloadTier>();
  const matchingIndexes = (manifest.fileIndexes ?? []).filter((index) =>
    paths.some((path) => (index.pathPrefixes ?? []).some((prefix) => path.startsWith(prefix)))
  );
  for (const index of matchingIndexes) tiers.add(index.indexesTier);
  if (!tiers.size) {
    for (const index of manifest.fileIndexes ?? []) tiers.add(index.indexesTier);
  }
  return tiers;
}

function validateManifestFile(file: DataPackageFile, errors: string[]): void {
  if (!file.path || file.path.startsWith("/") || file.path.includes("..")) {
    errors.push(`invalid file path ${file.path}`);
  }
  if (!file.category) errors.push(`${file.path} missing category`);
  if (!file.downloadTier) errors.push(`${file.path} missing downloadTier`);
  if (!/^[a-f0-9]{64}$/i.test(file.sha256)) errors.push(`${file.path} has invalid sha256`);
  if (!Number.isFinite(file.sizeBytes) || file.sizeBytes < 0) errors.push(`${file.path} has invalid sizeBytes`);
}

async function hasAllFiles(store: DataPackageStore, dataVersion: string, files: DataPackageFile[]): Promise<boolean> {
  for (const file of files) {
    if (!(await store.readFile(dataVersion, file.path))) return false;
  }
  return true;
}

async function sha256Text(content: string): Promise<string> {
  const bytes = new TextEncoder().encode(content);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
