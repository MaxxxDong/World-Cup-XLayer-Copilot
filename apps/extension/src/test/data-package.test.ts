import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  buildFileUrl,
  checkDataPackageManifest,
  ensureCoreDataPackage,
  ensureDataPackageFiles,
  pullDataPackage,
  selectManifestFiles,
  summarizeDataPackageManifest,
  validateDataPackageManifest,
  verifyDataPackageFile
} from "../services/data-package";
import { MemoryDataPackageStore } from "../services/data-store";
import type { DataPackageManifest } from "../shared/types";

const manifest: DataPackageManifest = {
  schemaVersion: "1.0.0",
  dataVersion: "2026.05.26+test",
  generatedAt: "2026-05-26T12:00:00.000Z",
  gitCommit: "abc123",
  minExtensionVersion: "0.1.0",
  recommendedExtensionVersion: "0.1.0",
  license: "mixed-source-attributed",
  files: [
    {
      path: "data/sources/sources.json",
      category: "sources",
      downloadTier: "core",
      required: true,
      sha256: "37517e5f3dc66819f61f5a7bb8ace1921282415f10551d2defa5c3eb0985b570",
      sizeBytes: 3,
      recordCount: 0,
      updatedAt: "2026-05-26T12:00:00.000Z"
    },
    ...[
      "data/metadata/coverage.json",
      "data/taxonomy/teams.json",
      "data/taxonomy/team-aliases.json",
      "data/taxonomy/team-quality.json",
      "data/taxonomy/venues.json",
      "data/schedule/worldcup-2026.json",
      "data/history/international-results-index.json"
    ].map((path) => ({
      path,
      category: path.includes("schedule")
        ? "schedule"
        : path.includes("history")
          ? "history.index"
          : path.includes("metadata")
            ? "metadata.coverage"
          : path.includes("quality")
            ? "taxonomy.teamQuality"
          : path.includes("venues")
            ? "taxonomy.venues"
          : path.includes("aliases")
            ? "taxonomy.aliases"
            : "taxonomy.teams",
      downloadTier: "core" as const,
      required: true,
      sha256: "44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a",
      sizeBytes: 2,
      recordCount: 1,
      updatedAt: "2026-05-26T12:00:00.000Z"
    })),
    {
      path: "data/history/head-to-head/arg__bra.json",
      category: "history.headToHead",
      downloadTier: "match-context",
      required: false,
      sha256: "44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a",
      sizeBytes: 2,
      recordCount: 1,
      updatedAt: "2026-05-26T12:00:00.000Z"
    },
    {
      path: "checksums/sha256.txt",
      category: "checksums",
      downloadTier: "audit",
      required: false,
      sha256: "01ba4719c80b6fe911b091a7c05124b64eeece964e09c058ef8f9805daca546b",
      sizeBytes: 1,
      updatedAt: "2026-05-26T12:00:00.000Z"
    }
  ]
};

const splitIndexFile = manifest.files.find((file) => file.path === "data/history/head-to-head/arg__bra.json")!;
const splitIndexContent = JSON.stringify({
  fileDefaults: {
    category: splitIndexFile.category,
    downloadTier: splitIndexFile.downloadTier,
    required: splitIndexFile.required,
    recordCount: splitIndexFile.recordCount,
    updatedAt: splitIndexFile.updatedAt
  },
  files: [
    {
      path: splitIndexFile.path,
      sha256: splitIndexFile.sha256,
      sizeBytes: splitIndexFile.sizeBytes
    }
  ]
});
const splitManifest: DataPackageManifest = {
  ...manifest,
  files: manifest.files.filter((file) => file.downloadTier === "core"),
  fileIndexes: [
    {
      path: "indexes/files-match-context.json",
      category: "indexes.files",
      downloadTier: "match-context",
      indexesTier: "match-context",
      indexId: "files-match-context-head-to-head",
      pathPrefixes: ["data/history/head-to-head/"],
      categories: ["history.headToHead"],
      required: false,
      sha256: sha256(splitIndexContent),
      sizeBytes: new TextEncoder().encode(splitIndexContent).byteLength,
      recordCount: 1,
      updatedAt: "2026-05-26T12:00:00.000Z"
    }
  ]
};

describe("data package manifest", () => {
  it("validates schema compatibility and required core files", () => {
    const result = validateDataPackageManifest(manifest);

    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("rejects manifests without a core required file", () => {
    const broken = {
      ...manifest,
      files: manifest.files.filter((file) => file.path !== "data/sources/sources.json")
    };

    const result = validateDataPackageManifest(broken);

    expect(result.ok).toBe(false);
    expect(result.errors.join("\n")).toContain("data/sources/sources.json");
  });

  it("selects files by download tier without pulling audit files by default", () => {
    const files = selectManifestFiles(manifest, ["core", "match-context"]);

    expect(files.map((file) => file.path)).toEqual([
      "data/history/head-to-head/arg__bra.json",
      "data/history/international-results-index.json",
      "data/metadata/coverage.json",
      "data/schedule/worldcup-2026.json",
      "data/sources/sources.json",
      "data/taxonomy/team-aliases.json",
      "data/taxonomy/team-quality.json",
      "data/taxonomy/teams.json",
      "data/taxonomy/venues.json"
    ]);
  });

  it("summarizes file counts and bytes by tier and category", () => {
    const summary = summarizeDataPackageManifest(manifest);

    expect(summary.fileCount).toBe(10);
    expect(summary.totalBytes).toBe(20);
    expect(summary.requiredFiles).toBe(8);
    expect(summary.requiredBytes).toBe(17);
    expect(summary.byTier.core).toEqual({ files: 8, bytes: 17 });
    expect(summary.byTier["match-context"]).toEqual({ files: 1, bytes: 2 });
    expect(summary.byTier.audit).toEqual({ files: 1, bytes: 1 });
    expect(summary.byCategory.sources).toEqual({ files: 1, bytes: 3 });
  });

  it("verifies sha256 and byte size for downloaded files", async () => {
    await expect(verifyDataPackageFile(manifest.files[0], "[]\n")).resolves.toBeUndefined();
    await expect(verifyDataPackageFile(manifest.files[0], "{}")).rejects.toThrow(/size mismatch/);
  });

  it("builds data file URLs relative to the manifest URL", () => {
    expect(buildFileUrl("https://example.test/releases/latest/manifest.json", "data/sources/sources.json")).toBe(
      "https://example.test/releases/latest/data/sources/sources.json"
    );
  });
});

describe("pullDataPackage", () => {
  it("checks a manifest without downloading package files", async () => {
    const store = new MemoryDataPackageStore();
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = input.toString();
      if (url.endsWith("manifest.json")) return new Response(JSON.stringify(manifest), { status: 200 });
      return new Response("not found", { status: 404 });
    });

    const result = await checkDataPackageManifest({
      manifestUrl: "https://example.test/manifest.json",
      store,
      fetchFn: fetchMock
    });

    expect(result.summary.dataVersion).toBe("2026.05.26+test");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await expect(store.readManifest(manifest.dataVersion)).resolves.toEqual(manifest);
    await expect(store.readVersionState()).resolves.toMatchObject({
      manifestUrl: "https://example.test/manifest.json"
    });
  });

  it("stores a pending version and atomically switches active version after hash validation", async () => {
    const store = new MemoryDataPackageStore();
    const progress: Array<{ totalFiles: number; checkedFiles: number; downloadedFiles: number }> = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = input.toString();
      if (url.endsWith("manifest.json")) return new Response(JSON.stringify(manifest), { status: 200 });
      if (url.endsWith("data/sources/sources.json")) return new Response("[]\n", { status: 200 });
      if (url.endsWith(".json")) return new Response("{}", { status: 200 });
      return new Response("not found", { status: 404 });
    });

    const result = await pullDataPackage({
      manifestUrl: "https://example.test/manifest.json",
      tiers: ["core"],
      store,
      fetchFn: fetchMock,
      onProgress: (event) =>
        progress.push({
          totalFiles: event.totalFiles,
          checkedFiles: event.checkedFiles,
          downloadedFiles: event.downloadedFiles
        })
    });

    expect(result.dataVersion).toBe("2026.05.26+test");
    expect(result.downloadedFiles).toBe(8);
    expect(progress.at(-1)).toEqual({ totalFiles: 8, checkedFiles: 8, downloadedFiles: 8 });
    await expect(store.readFile("2026.05.26+test", "data/sources/sources.json")).resolves.toBe("[]\n");
    await expect(store.readVersionState()).resolves.toMatchObject({
      activeDataVersion: "2026.05.26+test",
      pendingDataVersion: undefined
    });
  });

  it("ensures the latest core package and skips downloading an already cached version", async () => {
    const store = new MemoryDataPackageStore();
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = input.toString();
      if (url.endsWith("manifest.json")) return new Response(JSON.stringify(manifest), { status: 200 });
      if (url.endsWith("data/sources/sources.json")) return new Response("[]\n", { status: 200 });
      if (url.endsWith(".json")) return new Response("{}", { status: 200 });
      return new Response("not found", { status: 404 });
    });

    const first = await ensureCoreDataPackage({
      manifestUrl: "https://example.test/manifest.json",
      store,
      fetchFn: fetchMock
    });
    const second = await ensureCoreDataPackage({
      manifestUrl: "https://example.test/manifest.json",
      store,
      fetchFn: fetchMock
    });

    expect(first.downloadedFiles).toBe(8);
    expect(second.downloadedFiles).toBe(0);
    expect(fetchMock.mock.calls.filter(([input]) => input.toString().endsWith("manifest.json"))).toHaveLength(3);
    expect(fetchMock.mock.calls.filter(([input]) => !input.toString().endsWith("manifest.json"))).toHaveLength(8);
    await expect(store.readVersionState()).resolves.toMatchObject({
      activeDataVersion: manifest.dataVersion,
      manifestUrl: "https://example.test/manifest.json"
    });
  });

  it("loads split manifest indexes when pulling optional tiers", async () => {
    const store = new MemoryDataPackageStore();
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = input.toString();
      if (url.endsWith("manifest.json")) return new Response(JSON.stringify(splitManifest), { status: 200 });
      if (url.endsWith("indexes/files-match-context.json")) return new Response(splitIndexContent, { status: 200 });
      if (url.endsWith("data/sources/sources.json")) return new Response("[]\n", { status: 200 });
      if (url.endsWith(".json")) return new Response("{}", { status: 200 });
      return new Response("not found", { status: 404 });
    });

    const result = await pullDataPackage({
      manifestUrl: "https://example.test/manifest.json",
      tiers: ["core", "match-context"],
      store,
      fetchFn: fetchMock
    });

    expect(result.downloadedFiles).toBe(9);
    await expect(store.readFile(splitManifest.dataVersion, "data/history/head-to-head/arg__bra.json")).resolves.toBe(
      "{}"
    );
    expect(fetchMock).toHaveBeenCalledWith("https://example.test/indexes/files-match-context.json");
  });

  it("keeps the active version unchanged when a downloaded file fails validation", async () => {
    const store = new MemoryDataPackageStore();
    await store.setVersionState({ activeDataVersion: "old-version" });
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = input.toString();
      if (url.endsWith("manifest.json")) return new Response(JSON.stringify(manifest), { status: 200 });
      return new Response("{}", { status: 200 });
    });

    await expect(
      pullDataPackage({
        manifestUrl: "https://example.test/manifest.json",
        tiers: ["core"],
        store,
        fetchFn: fetchMock
      })
    ).rejects.toThrow(/size mismatch/);
    await expect(store.readVersionState()).resolves.toMatchObject({ activeDataVersion: "old-version" });
  });

  it("rolls back to the previous active version", async () => {
    const store = new MemoryDataPackageStore();
    await store.setVersionState({
      activeDataVersion: "new-version",
      previousDataVersion: "old-version"
    });

    await store.rollback();

    await expect(store.readVersionState()).resolves.toMatchObject({
      activeDataVersion: "old-version",
      previousDataVersion: "new-version"
    });
  });

  it("resets to the bundled snapshot while preserving rollback target", async () => {
    const store = new MemoryDataPackageStore();
    await store.setVersionState({
      activeDataVersion: "remote-version",
      previousDataVersion: "old-version"
    });

    await store.resetToBundledSnapshot();

    await expect(store.readVersionState()).resolves.toMatchObject({
      activeDataVersion: undefined,
      previousDataVersion: "remote-version",
      pendingDataVersion: undefined
    });
  });

  it("downloads missing optional files by exact path from the active manifest", async () => {
    const store = new MemoryDataPackageStore();
    await store.writeManifest(manifest.dataVersion, manifest);
    await store.setVersionState({
      activeDataVersion: manifest.dataVersion,
      manifestUrl: "https://example.test/manifest.json"
    });
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = input.toString();
      if (url.endsWith("data/history/head-to-head/arg__bra.json")) {
        return new Response("{}", { status: 200 });
      }
      return new Response("not found", { status: 404 });
    });

    const result = await ensureDataPackageFiles({
      paths: ["data/history/head-to-head/arg__bra.json"],
      store,
      fetchFn: fetchMock
    });

    expect(result.downloadedFiles).toBe(1);
    await expect(
      store.readFile(manifest.dataVersion, "data/history/head-to-head/arg__bra.json")
    ).resolves.toBe("{}");
  });

  it("loads split manifest indexes before downloading a missing optional file", async () => {
    const store = new MemoryDataPackageStore();
    await store.writeManifest(splitManifest.dataVersion, splitManifest);
    await store.setVersionState({
      activeDataVersion: splitManifest.dataVersion,
      manifestUrl: "https://example.test/manifest.json"
    });
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = input.toString();
      if (url.endsWith("indexes/files-match-context.json")) return new Response(splitIndexContent, { status: 200 });
      if (url.endsWith("data/history/head-to-head/arg__bra.json")) return new Response("{}", { status: 200 });
      return new Response("not found", { status: 404 });
    });

    const result = await ensureDataPackageFiles({
      paths: ["data/history/head-to-head/arg__bra.json"],
      store,
      fetchFn: fetchMock
    });

    expect(result.downloadedFiles).toBe(1);
    await expect(store.readFile(splitManifest.dataVersion, "data/history/head-to-head/arg__bra.json")).resolves.toBe(
      "{}"
    );
    await expect(store.readManifest(splitManifest.dataVersion)).resolves.toMatchObject({
      files: expect.arrayContaining([
        expect.objectContaining({
          category: "history.headToHead",
          downloadTier: "match-context",
          path: "data/history/head-to-head/arg__bra.json"
        })
      ])
    });
  });
});

function sha256(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}
