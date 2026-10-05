"use client";
import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  Check,
  Copy,
  LoaderCircle,
  Save,
} from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Brand } from "@/components/brand";
import { ThemeToggle } from "@/components/theme-toggle";
import { WorldScene } from "@/components/world-scene";
import { PANELS, type Album, type PanelId } from "@/lib/panels";
import { MAX_IMAGE_BYTES, MAX_IMAGE_MB } from "@/lib/upload-limits";
import {
  copyText,
  readResponse,
  rememberToken,
  recalledToken,
  ResponseError,
  withNickname,
} from "@/lib/client";

export function AlbumEditor({ id }: { id: string }) {
  const [album, setAlbum] = useState<Album | null>(null);
  const [token, setToken] = useState("");
  const [nickname, setNickname] = useState("");
  const [files, setFiles] = useState<Partial<Record<PanelId, File>>>({});
  const [removed, setRemoved] = useState<PanelId[]>([]);
  const [orientations, setOrientations] = useState<Partial<Record<PanelId, "landscape" | "portrait">>>({});
  const [previews, setPreviews] = useState<Partial<Record<PanelId, string>>>(
    {},
  );
  const [busy, setBusy] = useState(false);
  const [checkingPhoto, setCheckingPhoto] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [dirty, setDirty] = useState(false);
  const [copied, setCopied] = useState("");
  const [dataUrl, setDataUrl] = useState("");
  const [retry, setRetry] = useState(0);
  const [conflict, setConflict] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const uploadPanel = useRef<PanelId>("hero-left");
  const objectUrls = useRef(new Set<string>());
  const choosingPhoto = useRef(false);
  const worldUrl = withNickname(dataUrl, nickname);
  const expiryText = album?.expiresAt
    ? new Intl.DateTimeFormat("ko-KR", {
        dateStyle: "short",
        timeStyle: "short",
      }).format(new Date(album.expiresAt))
    : "";
  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError("");
      try {
        const key =
          new URLSearchParams(window.location.hash.slice(1)).get("key") ||
          recalledToken(id);
        if (!key)
          throw new Error(
            "이 앨범을 저장했던 브라우저에서 다시 불러와 주세요.",
          );
        setToken(key);
        const { album: loaded, dataUrl: publicUrl } = await readResponse<{
          album: Album;
          dataUrl?: string;
        }>(
          await fetch(`/api/albums/${id}`, {
            headers: { Authorization: `Bearer ${key}` },
            cache: "no-store",
          }),
        );
        if (!cancelled) {
          rememberToken(id, key);
          setAlbum(loaded);
          setNickname(loaded.nickname);
          setDataUrl(publicUrl ?? "");
        }
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [id, retry]);
  useEffect(
    () => () => {
      for (const url of objectUrls.current) URL.revokeObjectURL(url);
    },
    [],
  );
  useEffect(() => {
    function warn(e: BeforeUnloadEvent) {
      if (dirty) {
        e.preventDefault();
      }
    }
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  const photos = Object.fromEntries(
    PANELS.map((p) => [
      p.id,
      removed.includes(p.id) ? null : previews[p.id] ||
          (album?.panels[p.id] ? `/media/${id}/${album.panels[p.id]}` : null),
    ]),
  );
  async function choose(file: File | undefined, panel: PanelId) {
    if (!file || busy || choosingPhoto.current) return;
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
      setError("JPG, PNG, WebP 사진만 선택할 수 있어요.");
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setError(`사진 한 장은 ${MAX_IMAGE_MB}MB 이하여야 해요.`);
      return;
    }
    choosingPhoto.current = true;
    setBusy(true);
    setCheckingPhoto(true);
    const url = URL.createObjectURL(file);
    try {
      const image = new window.Image();
      image.src = url;
      await image.decode();
      const width = image.naturalWidth;
      const height = image.naturalHeight;
      if (width * 9 !== height * 16 && width * 16 !== height * 9) {
        throw new Error(`가로 16:9 또는 세로 9:16 사진만 사용할 수 있어요. 선택한 사진은 ${width}×${height}px입니다. 사진을 자르거나 여백을 넣어 비율을 맞춰 주세요.`);
      }
      setOrientations(prev => ({ ...prev, [panel]: width > height ? "landscape" : "portrait" }));
    } catch (e) {
      URL.revokeObjectURL(url);
      setError(e instanceof Error && e.name !== "EncodingError" ? e.message : "사진을 읽지 못했어요. 올바른 JPG, PNG, WebP 파일을 선택해 주세요.");
      setBusy(false);
      setCheckingPhoto(false);
      choosingPhoto.current = false;
      return;
    }
    if (previews[panel]) {
      URL.revokeObjectURL(previews[panel]!);
      objectUrls.current.delete(previews[panel]!);
    }
    objectUrls.current.add(url);
    setFiles((prev) => ({ ...prev, [panel]: file }));
    setPreviews((prev) => ({ ...prev, [panel]: url }));
    setRemoved((prev) => prev.filter((id) => id !== panel));
    setDirty(true);
    setError("");
    setBusy(false);
    setCheckingPhoto(false);
    choosingPhoto.current = false;
  }
  function remove(panel: PanelId) {
    if (previews[panel]) {
      URL.revokeObjectURL(previews[panel]!);
      objectUrls.current.delete(previews[panel]!);
    }
    setFiles(prev => { const next = { ...prev }; delete next[panel]; return next; });
    setPreviews(prev => { const next = { ...prev }; delete next[panel]; return next; });
    setRemoved(prev => Array.from(new Set([...prev, panel])));
    setDirty(true);
  }
  async function save() {
    if (!album) return;
    setBusy(true);
    setError("");
    try {
      const name = nickname.trim().normalize("NFC");
      if (new TextEncoder().encode(name).length > 128) {
        throw new Error("이름은 UTF-8 128바이트 이하로 입력해 주세요. 한글은 보통 42자까지 사용할 수 있어요.");
      }
      if (/[\u0000-\u001f\u007f]/.test(nickname)) {
        throw new Error("이름에 줄바꿈이나 제어 문자를 사용할 수 없어요.");
      }
      const body = new FormData();
      body.set("nickname", name);
      body.set("revision", String(album.revision));
      body.set("remove", JSON.stringify(removed));
      for (const p of PANELS) if (files[p.id]) body.set(p.id, files[p.id]!);
      const { album: updated, dataUrl: publicUrl } = await readResponse<{
        album: Album;
        dataUrl?: string;
      }>(
        await fetch(`/api/albums/${id}`, {
          method: "PUT",
          headers: { Authorization: `Bearer ${token}` },
          body,
        }),
      );
      setAlbum(updated);
      setDataUrl(publicUrl ?? "");
      setNickname(updated.nickname);
      setFiles({});
      setRemoved([]);
      setPreviews({});
      setOrientations({});
      for (const url of objectUrls.current) URL.revokeObjectURL(url);
      objectUrls.current.clear();
      setDirty(false);
    } catch (e) {
      setConflict(e instanceof ResponseError && e.status === 409);
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function guardExit(e: React.MouseEvent<HTMLAnchorElement>) {
    if (
      dirty &&
      !window.confirm("저장하지 않은 변경 사항이 있어요. 나가시겠어요?")
    )
      e.preventDefault();
  }
  function reloadSaved() {
    if (
      !window.confirm(
        "저장하지 않은 변경 사항을 버리고 서버의 최신 내용을 불러올까요?",
      )
    )
      return;
    for (const url of objectUrls.current) URL.revokeObjectURL(url);
    objectUrls.current.clear();
    setFiles({});
    setRemoved([]);
    setPreviews({});
    setOrientations({});
    setDirty(false);
    setConflict(false);
    setRetry((v) => v + 1);
  }
  async function copy() {
    try {
      await copyText(worldUrl);
      setError("");
      setCopied("data");
      setTimeout(() => setCopied(""), 2000);
    } catch {
      const field = document.getElementById("world-url") as HTMLInputElement | null;
      field?.focus();
      field?.select();
      setError(
        "브라우저가 자동 복사를 차단했어요. 선택된 링크를 길게 눌러 복사해 주세요.",
      );
    }
  }
  function openPicker(panel: PanelId) {
    if (busy) return;
    uploadPanel.current = panel;
    fileInput.current?.click();
  }
  if (loading)
    return (
      <main className="center-state">
        <LoaderCircle className="spin" />
        <p>불러오는 중…</p>
      </main>
    );
  if (!album)
    return (
      <main className="center-state">
        <Brand />
        <h1>공간을 열 수 없어요</h1>
        <p role="alert">{error}</p>
        <Button onClick={() => setRetry((v) => v + 1)}>다시 시도</Button>
        <Button variant="outline" asChild>
          <Link href="/">처음으로</Link>
        </Button>
      </main>
    );
  return (
    <div className="controller-page">
      <header className="controller-header">
        <Brand onClick={guardExit} />
        <div className="header-actions">
          <ThemeToggle />
          <Button variant="ghost" asChild>
            <Link href="/" onClick={guardExit}>
              <ArrowLeft size={16} />
              처음으로
            </Link>
          </Button>
        </div>
      </header>
      <main className="controller-main editor-main">
        <div className="editor-heading">
          <h1 className="sr-only">사진 설정</h1>
          <div className="name-control">
            <label htmlFor="nickname">생일자의 이름</label>
            <Input id="nickname" placeholder="이름 입력" value={nickname} disabled={busy}
              onChange={(e) => { setNickname(e.target.value); setDirty(true); }} />
          </div>
        </div>
        {error && (
          <div className="error-banner" role="alert">
            {error}
            {conflict && (
              <Button variant="outline" size="sm" onClick={reloadSaved}>
                최신 내용 불러오기
              </Button>
            )}
          </div>
        )}
        <div className="controller-workspace">
          <section className="scene-workspace" aria-label="사진 패널 선택">
            <div className="scene-instruction">
              <h2>패널을 누르거나 사진을 끌어 놓으세요.</h2>
            </div>
            <WorldScene
              orientations={{ ...album.panelOrientations, ...orientations }}
              photos={photos}
              onSelect={openPicker}
              onRemove={remove}
              onDropPhoto={(panel, dropped) => {
                if (dropped.length !== 1) {
                  setError("패널 하나에 사진 한 장씩 끌어 놓아 주세요.");
                  return;
                }
                void choose(dropped[0], panel);
              }}
              disabled={busy}
            />
            <p className="gallery-footnote">가로 16:9 또는 세로 9:16 · JPG, PNG, WebP · 사진당 {MAX_IMAGE_MB}MB까지 · 저장 후 24시간 보관</p>
          </section>
          <div className="controller-inspector">
            <input
              ref={fileInput}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="sr-only"
              tabIndex={-1}
              onChange={(e) => {
                void choose(e.target.files?.[0], uploadPanel.current);
                e.target.value = "";
              }}
            />
            <div className="controller-save">
              <div
                className={`save-state ${dirty ? "unsaved" : ""}`}
                role="status"
              >
                <span />
                {busy
                  ? checkingPhoto ? "사진 확인 중…" : "저장 중…"
                  : dirty
                    ? "저장하지 않은 변경 사항"
                    : album.revision
                      ? "모든 변경 사항 저장됨"
                      : "이름과 사진을 입력하세요"}
              </div>
              <Button
                size="lg"
                onClick={save}
                disabled={busy || (!dirty && Boolean(album.atlasId))}
                className="save-button"
              >
                {busy ? (
                  <LoaderCircle className="spin" size={17} />
                ) : (
                  <Save size={17} />
                )}
                <span>{album.atlasId ? "변경 사항 저장" : "저장하고 링크 만들기"}</span>
              </Button>
            </div>
          </div>
        </div>
        {dataUrl && <section className="world-link" aria-label="월드에 적용할 링크">
          <label htmlFor="world-url">
            월드에 붙여 넣을 링크{dataUrl && (Object.keys(files).length || removed.length) ? " · 새 사진은 저장 후 반영돼요" : ""}
            {expiryText ? ` · ${expiryText} 만료` : " · 저장 후 24시간 보관"}
          </label>
          <div>
            <Input
              id="world-url"
              aria-label="VRChat용 이미지 링크"
              readOnly
              value={worldUrl}
              placeholder="저장하면 링크가 표시됩니다"
              onFocus={(e) => e.target.select()}
            />
            <Button
              aria-label="VRChat용 이미지 링크 복사"
              onClick={copy}
              disabled={!dataUrl || busy}
              variant="outline"
            >
              {copied === "data" ? <Check size={16} /> : <Copy size={16} />}
              {copied === "data" ? "복사했어요" : "링크 복사"}
            </Button>
          </div>
        </section>}
      </main>
    </div>
  );
}
