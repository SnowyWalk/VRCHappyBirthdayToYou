import type { Album } from "./panels";

export const tokenKey = (id: string) => `birthday-world:edit:${id}`;
const recentKey = "birthday-world:recent-albums";
export type RecentAlbum = Pick<Album, "id" | "nickname" | "createdAt" | "updatedAt" | "expiresAt" | "revision" | "atlasId">;
type StoredRecentAlbum = RecentAlbum & { editToken: string };
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function storedRecentAlbums(): StoredRecentAlbum[] {
  try {
    const records: unknown = JSON.parse(localStorage.getItem(recentKey) ?? "[]");
    if (!Array.isArray(records)) return [];
    return records.filter((record): record is StoredRecentAlbum =>
      record && typeof record.id === "string" && uuidPattern.test(record.id) &&
      typeof record.editToken === "string" && /^[\w-]{43}$/.test(record.editToken) &&
      typeof record.nickname === "string" && Number.isFinite(Date.parse(record.createdAt)) &&
      Number.isFinite(Date.parse(record.updatedAt)) && Number.isInteger(record.revision) &&
      (!record.expiresAt || Number.isFinite(Date.parse(record.expiresAt))));
  } catch { return []; }
}

export function readRecentAlbums(): RecentAlbum[] {
  return storedRecentAlbums()
    .filter(record => Date.parse(record.expiresAt ?? new Date(Date.parse(record.updatedAt) + 86400000).toISOString()) > Date.now())
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .slice(0, 5)
    .map(record => ({ id: record.id, nickname: record.nickname, createdAt: record.createdAt,
      updatedAt: record.updatedAt, expiresAt: record.expiresAt, revision: record.revision, atlasId: record.atlasId }));
}

export function rememberAlbum(album: Album, token: string) {
  rememberToken(album.id, token);
  try {
    const records = storedRecentAlbums().filter(record => record.id !== album.id);
    records.push({ id: album.id, nickname: album.nickname, createdAt: album.createdAt,
      updatedAt: album.updatedAt, expiresAt: album.expiresAt, revision: album.revision,
      atlasId: album.atlasId, editToken: token });
    records.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
    localStorage.setItem(recentKey, JSON.stringify(records.slice(0, 5)));
  } catch { /* The private edit URL remains usable without browser storage. */ }
}

export async function refreshRecentAlbums(): Promise<RecentAlbum[]> {
  const ids = new Set(storedRecentAlbums().map(record => record.id));
  try {
    for (let index = 0; index < localStorage.length; index++) {
      const key = localStorage.key(index);
      if (key?.startsWith("birthday-world:edit:")) {
        const id = key.slice("birthday-world:edit:".length);
        if (uuidPattern.test(id)) ids.add(id);
      }
    }
  } catch { return readRecentAlbums(); }
  await Promise.all([...ids].map(async id => {
    const token = recalledToken(id);
    if (!token) return;
    try {
      const response = await fetch(`/api/albums/${id}`, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
      if (response.ok) {
        const { album } = await response.json() as { album: Album };
        rememberAlbum(album, token);
      } else if ([401, 404, 410].includes(response.status)) {
        localStorage.setItem(recentKey, JSON.stringify(storedRecentAlbums().filter(record => record.id !== id)));
      }
    } catch { /* Keep locally recorded links when the connection is unavailable. */ }
  }));
  return readRecentAlbums();
}

export function formatRelativeTime(iso: string, now = Date.now()) {
  const elapsed = Math.max(0, now - Date.parse(iso));
  if (elapsed < 60000) return "방금 전";
  if (elapsed < 3600000) return `${Math.floor(elapsed / 60000)}분 전`;
  if (elapsed < 86400000) return `${Math.floor(elapsed / 3600000)}시간 전`;
  return `${Math.floor(elapsed / 86400000)}일 전`;
}
export const editUrl = (id: string, token: string) =>
  `${window.location.origin}/edit/${id}#key=${token}`;
export async function copyText(text: string) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      // Some browsers deny the modern API; try selection-based copying.
    }
  }
  const previousFocus = document.activeElement;
  const field = document.createElement("textarea");
  field.value = text;
  field.readOnly = true;
  field.style.cssText = "position:fixed;top:0;left:0;opacity:0;font-size:16px;";
  document.body.appendChild(field);
  try {
    field.focus({ preventScroll: true });
    field.select();
    field.setSelectionRange(0, text.length);
    // Compatibility fallback for HTTP LAN access, where Clipboard API is absent.
    if (!document.execCommand("copy")) throw new Error("Copy was denied");
  } finally {
    field.remove();
    if (previousFocus instanceof HTMLElement)
      previousFocus.focus({ preventScroll: true });
  }
}
export function withNickname(url: string, nickname: string) {
  if (!url) return "";
  const imageUrl = new URL(url);
  // Always include name, even when empty, to override names in legacy PNGs.
  imageUrl.searchParams.delete("name");
  const query = imageUrl.searchParams.toString();
  return `${imageUrl.origin}${imageUrl.pathname}?${query ? `${query}&` : ""}name=${encodeURIComponent(nickname.trim().normalize("NFC"))}`;
}
export function rememberToken(id: string, token: string) {
  try {
    localStorage.setItem(tokenKey(id), token);
  } catch {
    /* The edit URL still works when browser storage is unavailable. */
  }
}
export function recalledToken(id: string) {
  try {
    return localStorage.getItem(tokenKey(id)) || storedRecentAlbums().find(record => record.id === id)?.editToken || null;
  } catch {
    return null;
  }
}
export class ResponseError extends Error {
  public status: number;
  constructor(
    message: string,
    status: number,
  ) {
    super(message);
    this.status = status;
  }
}
export function parseAlbumInput(value: string): { id: string; token?: string } | { atlasId: string } {
  const raw = value.trim();
  try {
    const url = new URL(raw, window.location.origin);
    const atlas = url.pathname.match(/^\/party\/([a-f0-9]{64})\/atlas\.png$/i);
    if (atlas && ["http:", "https:"].includes(url.protocol))
      return { atlasId: atlas[1].toLowerCase() };
  } catch {
    // Continue checking UUID and edit links.
  }
  const match = raw.match(
    /(?:^|\/)([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})(?:$|[?#/])/i,
  );
  if (!match) throw new Error("올바른 UUID 또는 앨범 링크를 입력해 주세요. 월드용 이미지 링크도 사용할 수 있어요.");
  const token = raw.includes("#")
    ? (new URLSearchParams(raw.split("#")[1]).get("key") ?? undefined)
    : undefined;
  return { id: match[1].toLowerCase(), token };
}
export async function readResponse<T>(response: Response): Promise<T> {
  const body = await response.json();
  if (!response.ok)
    throw new ResponseError(
      body.error ?? "요청을 처리하지 못했어요.",
      response.status,
    );
  return body;
}
