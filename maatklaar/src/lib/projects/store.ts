"use client";

import { LIMITS } from "@/config/site";
import { projectSchema, type Project } from "./schema";

/**
 * Browser-side project storage in IndexedDB: the project model and, if the user allows it, the original plan
 * file. Nothing here leaves the device. When IndexedDB is unavailable (some private modes) we fall back to
 * memory and tell the user that progress is lost on refresh.
 */
const DB_NAME = "maatklaar";
const DB_VERSION = 1;
const PROJECTS = "projects";
const FILES = "files";

export type StoredFile = { projectId: string; blob: Blob; type: string; savedAt: string };
export type ProjectSummary = { id: string; name: string; updatedAt: string; address: string | null; paid: boolean };

let dbPromise: Promise<IDBDatabase> | null = null;
const memory = { projects: new Map<string, unknown>(), files: new Map<string, StoredFile>() };
export let persistent = true;

function open(): Promise<IDBDatabase> {
  dbPromise ??= new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === "undefined") return reject(new Error("geen IndexedDB"));
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(PROJECTS)) db.createObjectStore(PROJECTS, { keyPath: "id" });
      if (!db.objectStoreNames.contains(FILES)) db.createObjectStore(FILES, { keyPath: "projectId" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error("IndexedDB geblokkeerd"));
  }).catch((err) => {
    persistent = false;
    throw err;
  });
  return dbPromise;
}

function tx<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  return open().then(
    (db) =>
      new Promise<T | undefined>((resolve, reject) => {
        const t = db.transaction(store, mode);
        const req = fn(t.objectStore(store));
        t.oncomplete = () => resolve(req ? req.result : undefined);
        t.onerror = () => reject(t.error);
        t.onabort = () => reject(t.error);
      }),
  );
}

async function withFallback<T>(idb: () => Promise<T>, mem: () => T): Promise<T> {
  if (!persistent) return mem();
  try {
    return await idb();
  } catch {
    persistent = false;
    return mem();
  }
}

function parse(raw: unknown): Project | null {
  const r = projectSchema.safeParse(raw);
  return r.success ? r.data : null;
}

export async function loadProject(id: string): Promise<Project | null> {
  const raw = await withFallback(
    () => tx<unknown>(PROJECTS, "readonly", (s) => s.get(id)),
    () => memory.projects.get(id),
  );
  return raw ? parse(raw) : null;
}

export async function saveProject(project: Project): Promise<void> {
  const value = projectSchema.parse(project);
  await withFallback(
    () => tx(PROJECTS, "readwrite", (s) => void s.put(value)).then(() => undefined),
    () => void memory.projects.set(value.id, value),
  );
}

export async function listProjects(): Promise<ProjectSummary[]> {
  const all = await withFallback(
    () => tx<unknown[]>(PROJECTS, "readonly", (s) => s.getAll()).then((r) => r ?? []),
    () => [...memory.projects.values()],
  );
  return all
    .map(parse)
    .filter((p): p is Project => p !== null)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .map((p) => ({
      id: p.id,
      name: p.name,
      updatedAt: p.updatedAt,
      address: p.address?.weergavenaam ?? null,
      paid: p.payment?.status === "paid",
    }));
}

export async function findProjectByOrder(orderId: string): Promise<Project | null> {
  const all = await withFallback(
    () => tx<unknown[]>(PROJECTS, "readonly", (s) => s.getAll()).then((r) => r ?? []),
    () => [...memory.projects.values()],
  );
  return all.map(parse).find((p) => p?.payment?.orderId === orderId) ?? null;
}

export async function deleteProject(id: string): Promise<void> {
  await deleteFile(id);
  await deletePhotos(id);
  await withFallback(
    () => tx(PROJECTS, "readwrite", (s) => void s.delete(id)).then(() => undefined),
    () => void memory.projects.delete(id),
  );
}

export async function saveFile(projectId: string, blob: Blob): Promise<void> {
  const value: StoredFile = { projectId, blob, type: blob.type, savedAt: new Date().toISOString() };
  await withFallback(
    () => tx(FILES, "readwrite", (s) => void s.put(value)).then(() => undefined),
    () => void memory.files.set(projectId, value),
  );
}

export async function loadFile(projectId: string): Promise<Blob | null> {
  const f = await withFallback(
    () => tx<StoredFile>(FILES, "readonly", (s) => s.get(projectId)),
    () => memory.files.get(projectId),
  );
  return f?.blob ?? sessionFiles.get(projectId) ?? null;
}

/** Files the user chose not to keep on the device live only in this tab, until it is closed. */
const sessionFiles = new Map<string, Blob>();

export function keepFileForSession(projectId: string, blob: Blob) {
  sessionFiles.set(projectId, blob);
}

export async function deleteFile(projectId: string): Promise<void> {
  sessionFiles.delete(projectId);
  await withFallback(
    () => tx(FILES, "readwrite", (s) => void s.delete(projectId)).then(() => undefined),
    () => void memory.files.delete(projectId),
  );
}

/** Window photos share the files store under their own key; they never leave the device either. */
const photoKey = (projectId: string, windowId: string) => `${projectId}#foto#${windowId}`;

export async function savePhoto(projectId: string, windowId: string, blob: Blob): Promise<void> {
  const value: StoredFile = { projectId: photoKey(projectId, windowId), blob, type: blob.type, savedAt: new Date().toISOString() };
  await withFallback(
    () => tx(FILES, "readwrite", (s) => void s.put(value)).then(() => undefined),
    () => void memory.files.set(value.projectId, value),
  );
}

export async function loadPhoto(projectId: string, windowId: string): Promise<Blob | null> {
  const key = photoKey(projectId, windowId);
  const f = await withFallback(
    () => tx<StoredFile>(FILES, "readonly", (s) => s.get(key)),
    () => memory.files.get(key),
  );
  return f?.blob ?? null;
}

export async function deletePhoto(projectId: string, windowId: string): Promise<void> {
  const key = photoKey(projectId, windowId);
  await withFallback(
    () => tx(FILES, "readwrite", (s) => void s.delete(key)).then(() => undefined),
    () => void memory.files.delete(key),
  );
}

async function deletePhotos(projectId: string): Promise<void> {
  const prefix = `${projectId}#foto#`;
  const keys = await withFallback(
    () => tx<IDBValidKey[]>(FILES, "readonly", (s) => s.getAllKeys()).then((k) => k ?? []),
    () => [...memory.files.keys()],
  );
  for (const key of keys) {
    if (typeof key !== "string" || !key.startsWith(prefix)) continue;
    await withFallback(
      () => tx(FILES, "readwrite", (s) => void s.delete(key)).then(() => undefined),
      () => void memory.files.delete(key),
    );
  }
}

/** Removes projects (and their files) that were not changed for LIMITS.projectExpiryDays. */
export async function purgeExpired(now = new Date()): Promise<number> {
  const cutoff = now.getTime() - LIMITS.projectExpiryDays * 24 * 3600 * 1000;
  const projects = await listProjects();
  let removed = 0;
  for (const p of projects) {
    if (new Date(p.updatedAt).getTime() < cutoff) {
      await deleteProject(p.id);
      removed++;
    }
  }
  return removed;
}
