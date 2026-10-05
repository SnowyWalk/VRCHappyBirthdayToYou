export const tokenKey = (id: string) => `birthday-world:edit:${id}`;
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
    return localStorage.getItem(tokenKey(id));
  } catch {
    return null;
  }
}
export class ResponseError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
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
