"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, Copy, FolderOpen, Images, Link2, LoaderCircle, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ThemeToggle } from "@/components/theme-toggle";
import { WorldScene } from "@/components/world-scene";
import { NameSign } from "@/components/name-sign";
import { LinkDialog } from "@/components/link-dialog";
import { LoadDialog } from "@/components/load-dialog";
import { PhotoFramingDialog } from "@/components/photo-framing-dialog";
import { PANELS, type Album, type PanelId } from "@/lib/panels";
import { preparePhoto, PhotoRatioError, type PhotoFramingOptions } from "@/lib/prepare-photo";
import {
  copyText,
  deleteSavedAlbum,
  formatRelativeTime,
  readRecentAlbums,
  readResponse,
  recalledToken,
  refreshRecentAlbums,
  rememberAlbum,
  ResponseError,
  withNickname,
  type RecentAlbum,
} from "@/lib/client";

function validatedName(value: string) {
  if (/[\u0000-\u001f\u007f]/.test(value)) {
    throw new Error("이름에 줄바꿈이나 제어 문자는 쓸 수 없어요.");
  }
  const name = value.trim().normalize("NFC");
  if (new TextEncoder().encode(name).length > 128) {
    throw new Error("이름이 너무 길어요. 한글 기준 42자까지 쓸 수 있어요.");
  }
  return name;
}

function hoursLeft(expiresAt: string | undefined, now: number) {
  if (!expiresAt || !now) return "24시간 유효";
  const hours = Math.ceil((Date.parse(expiresAt) - now) / 3600000);
  return hours > 1 ? `${hours}시간 남음` : "1시간 안에 만료";
}

/**
 * The whole flow on one screen: name, photos, then the link in a bar that is
 * always visible. Without `albumId` the page is a fresh draft; the album is
 * created on the first save and the address switches to its edit link.
 */
export function Studio({ albumId }: { albumId?: string }) {
  const router = useRouter();
  const [album, setAlbum] = useState<Album | null>(null);
  const [token, setToken] = useState("");
  const [loading, setLoading] = useState(Boolean(albumId));
  const [loadError, setLoadError] = useState("");
  const [retry, setRetry] = useState(0);
  const [recent, setRecent] = useState<RecentAlbum[]>([]);
  const [now, setNow] = useState(0);

  const [nickname, setNickname] = useState("");
  const [nameError, setNameError] = useState("");
  const [files, setFiles] = useState<Partial<Record<PanelId, File>>>({});
  const [previews, setPreviews] = useState<Partial<Record<PanelId, string>>>({});
  const [removed, setRemoved] = useState<PanelId[]>([]);
  const [dirty, setDirty] = useState(false);

  const [busy, setBusy] = useState(false);
  const [checkingPhoto, setCheckingPhoto] = useState(false);
  const [progress, setProgress] = useState("");
  const [photoError, setPhotoError] = useState<{ panel: PanelId; message: string } | null>(null);
  const [pendingPhoto, setPendingPhoto] = useState<{ file: File; panel: PanelId } | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [conflict, setConflict] = useState(false);

  const [dataUrl, setDataUrl] = useState("");
  const [linkOpen, setLinkOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copyBlocked, setCopyBlocked] = useState(false);
  const [loadOpen, setLoadOpen] = useState(false);

  const nameInput = useRef<HTMLInputElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const multiInput = useRef<HTMLInputElement>(null);
  const uploadPanel = useRef<PanelId>("hero-left");
  const objectUrls = useRef(new Set<string>());
  const choosingPhoto = useRef(false);

  useEffect(() => {
    if (!albumId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setLoadError("");
      try {
        const key = new URLSearchParams(window.location.hash.slice(1)).get("key") || recalledToken(albumId);
        if (!key) throw new Error("이 링크를 만든 브라우저에서 열어 주세요. 다른 기기라면 편집 링크(#key=…)가 필요해요.");
        const loaded = await readResponse<{ album: Album; dataUrl?: string }>(
          await fetch(`/api/albums/${albumId}`, { headers: { Authorization: `Bearer ${key}` }, cache: "no-store" }),
        );
        if (cancelled) return;
        rememberAlbum(loaded.album, key);
        setToken(key);
        setAlbum(loaded.album);
        setNickname(loaded.album.nickname);
        setDataUrl(loaded.dataUrl ?? "");
      } catch (e) {
        if (!cancelled) setLoadError((e as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [albumId, retry]);

  useEffect(() => {
    if (albumId) return;
    let cancelled = false;
    void refreshRecentAlbums().then((albums) => {
      if (!cancelled) { setRecent(albums); setNow(Date.now()); }
    });
    return () => { cancelled = true; };
  }, [albumId]);

  // Keep remaining-time labels fresh and drop recent links once they expire.
  useEffect(() => {
    const tick = () => { setNow(Date.now()); if (!albumId) setRecent(readRecentAlbums()); };
    tick();
    const timer = setInterval(tick, 5000);
    return () => clearInterval(timer);
  }, [albumId]);

  useEffect(() => {
    const urls = objectUrls.current;
    return () => { for (const url of urls) URL.revokeObjectURL(url); };
  }, []);

  useEffect(() => {
    function warn(event: BeforeUnloadEvent) { if (dirty) event.preventDefault(); }
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const photos = Object.fromEntries(
    PANELS.map((p) => [
      p.id,
      removed.includes(p.id)
        ? null
        : previews[p.id] || (album?.panels[p.id] ? `/media/${album.id}/${album.panels[p.id]}` : null),
    ]),
  ) as Record<PanelId, string | null>;
  const photoCount = Object.values(photos).filter(Boolean).length;
  const worldUrl = withNickname(dataUrl, album?.nickname ?? "");
  const ready = Boolean(dataUrl) && !dirty;

  function markChanged() {
    setDirty(true);
    setCopied(false);
    setError("");
  }

  function revoke(url: string | undefined) {
    if (!url) return;
    URL.revokeObjectURL(url);
    objectUrls.current.delete(url);
  }

  function openPicker(panel: PanelId) {
    if (busy) return;
    uploadPanel.current = panel;
    fileInput.current?.click();
  }

  function applyPhoto(panel: PanelId, file: File) {
    const url = URL.createObjectURL(file);
    revoke(previews[panel]);
    objectUrls.current.add(url);
    setFiles((prev) => ({ ...prev, [panel]: file }));
    setPreviews((prev) => ({ ...prev, [panel]: url }));
    setRemoved((prev) => prev.filter((id) => id !== panel));
  }

  async function choose(file: File | undefined, panel: PanelId, framing?: PhotoFramingOptions) {
    if (!file || busy || choosingPhoto.current) return;
    choosingPhoto.current = true;
    setBusy(true);
    setCheckingPhoto(true);
    setNotice("");
    try {
      const prepared = await preparePhoto(file, framing);
      applyPhoto(panel, prepared.file);
      setPhotoError(null);
      setPendingPhoto(null);
      markChanged();
    } catch (e) {
      if (e instanceof PhotoRatioError) {
        setPendingPhoto({ file, panel });
        setPhotoError(null);
      } else {
        setPendingPhoto(null);
        setPhotoError({
          panel,
          message: e instanceof Error && e.name !== "EncodingError" ? e.message : "사진을 읽지 못했어요.",
        });
      }
    } finally {
      setBusy(false);
      setCheckingPhoto(false);
      choosingPhoto.current = false;
    }
  }

  /** Fills empty frames in panel order; other ratios are center-cropped instead of asking. */
  async function addMany(list: File[]) {
    if (!list.length || busy || choosingPhoto.current) return;
    const empty = PANELS.map((p) => p.id).filter((id) => !photos[id]);
    if (!empty.length) {
      setNotice("빈 액자가 없어요. 바꿀 액자를 눌러 한 장씩 골라 주세요.");
      return;
    }
    choosingPhoto.current = true;
    setBusy(true);
    setCheckingPhoto(true);
    setNotice("");
    setPhotoError(null);
    let added = 0;
    let failed = 0;
    const batch = list.slice(0, empty.length);
    for (const [index, file] of batch.entries()) {
      setProgress(batch.length > 1 ? ` ${index + 1}/${batch.length}` : "");
      try {
        let prepared;
        try {
          prepared = await preparePhoto(file);
        } catch (e) {
          if (!(e instanceof PhotoRatioError)) throw e;
          prepared = await preparePhoto(file, {
            orientation: e.width >= e.height ? "landscape" : "portrait",
            mode: "crop",
            position: 0.5,
          });
        }
        applyPhoto(empty[added], prepared.file);
        added++;
      } catch {
        failed++;
      }
    }
    if (added) markChanged();
    const skipped = Math.max(0, list.length - empty.length);
    setNotice([
      added ? `${added}장을 넣었어요.` : "",
      skipped ? `빈 액자가 ${empty.length}칸이라 ${skipped}장은 넣지 못했어요.` : "",
      failed ? `${failed}장은 읽지 못했어요.` : "",
      added ? "액자를 누르면 다른 사진으로 바꿀 수 있어요." : "",
    ].filter(Boolean).join(" "));
    setProgress("");
    setBusy(false);
    setCheckingPhoto(false);
    choosingPhoto.current = false;
  }

  function remove(panel: PanelId) {
    revoke(previews[panel]);
    setFiles((prev) => { const next = { ...prev }; delete next[panel]; return next; });
    setPreviews((prev) => { const next = { ...prev }; delete next[panel]; return next; });
    setRemoved((prev) => Array.from(new Set([...prev, panel])));
    if (photoError?.panel === panel) setPhotoError(null);
    markChanged();
  }

  async function copy() {
    try {
      await copyText(worldUrl);
      setCopied(true);
      setCopyBlocked(false);
    } catch {
      setCopied(false);
      setCopyBlocked(true);
      setLinkOpen(true);
      // Select the link for a manual Ctrl+C, also when the dialog is already open.
      requestAnimationFrame(() => {
        const field = document.getElementById("world-url") as HTMLInputElement | null;
        field?.focus();
        field?.select();
      });
    }
  }

  async function save() {
    if (busy) return;
    let name: string;
    try {
      name = validatedName(nickname);
      setNameError("");
    } catch (e) {
      setNameError((e as Error).message);
      nameInput.current?.focus();
      return;
    }
    setBusy(true);
    setError("");
    try {
      let current = album;
      let key = token;
      if (!current) {
        const created = await readResponse<{ album: Album; editToken: string }>(
          await fetch("/api/albums", { method: "POST" }),
        );
        current = created.album;
        key = created.editToken;
        rememberAlbum(current, key);
        setAlbum(current);
        setToken(key);
        // Make reloads and the address bar point at this album without remounting.
        window.history.replaceState(null, "", `/edit/${current.id}#key=${key}`);
      }
      const body = new FormData();
      body.set("nickname", name);
      body.set("revision", String(current.revision));
      body.set("remove", JSON.stringify(removed));
      for (const p of PANELS) if (files[p.id]) body.set(p.id, files[p.id]!);
      const saved = await readResponse<{ album: Album; dataUrl?: string }>(
        await fetch(`/api/albums/${current.id}`, { method: "PUT", headers: { Authorization: `Bearer ${key}` }, body }),
      );
      for (const url of objectUrls.current) URL.revokeObjectURL(url);
      objectUrls.current.clear();
      rememberAlbum(saved.album, key);
      setAlbum(saved.album);
      setNickname(saved.album.nickname);
      setDataUrl(saved.dataUrl ?? "");
      setFiles({});
      setPreviews({});
      setRemoved([]);
      setDirty(false);
      setConflict(false);
      setNow(Date.now());

      // The save click is the user's intent to get the link, so copy it right away.
      const url = withNickname(saved.dataUrl ?? "", saved.album.nickname);
      try {
        await copyText(url);
        setCopied(true);
        setCopyBlocked(false);
      } catch {
        setCopied(false);
        setCopyBlocked(true);
      }
      setLinkOpen(true);
    } catch (e) {
      setConflict(e instanceof ResponseError && e.status === 409);
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function reloadSaved() {
    if (!window.confirm("아직 저장하지 않은 변경 사항을 버리고 마지막으로 저장한 내용을 불러올까요?")) return;
    for (const url of objectUrls.current) URL.revokeObjectURL(url);
    objectUrls.current.clear();
    setFiles({});
    setPreviews({});
    setRemoved([]);
    setDirty(false);
    setConflict(false);
    setError("");
    setRetry((v) => v + 1);
  }

  async function deleteAlbum() {
    if (!album || busy) return;
    if (!window.confirm("사진과 링크를 지금 삭제할까요? 월드에 붙여넣은 링크도 더 이상 열리지 않아요.")) return;
    setBusy(true);
    try {
      await deleteSavedAlbum(album.id, token);
      setDirty(false);
      router.replace("/");
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  async function deleteRecent(entry: RecentAlbum) {
    if (busy || !window.confirm(`'${entry.nickname || "이름 없음"}' 링크와 사진을 삭제할까요?`)) return;
    const key = recalledToken(entry.id);
    try {
      if (key) await deleteSavedAlbum(entry.id, key);
      setRecent(readRecentAlbums());
    } catch (e) {
      setError((e as Error).message);
    }
  }

  function confirmLeave(event: React.MouseEvent) {
    if (dirty && !window.confirm("저장하지 않은 변경 사항이 있어요. 이 화면을 떠날까요?")) event.preventDefault();
  }

  if (loading) {
    return (
      <main className="center-state">
        <LoaderCircle className="spin" />
        <p>불러오는 중…</p>
      </main>
    );
  }
  if (albumId && !album) {
    return (
      <main className="center-state">
        <h1>이 링크를 열 수 없어요</h1>
        <p role="alert">{loadError}</p>
        <div className="center-actions">
          <Button onClick={() => setRetry((v) => v + 1)} variant="outline">다시 시도</Button>
          <Button asChild><Link href="/">새로 만들기</Link></Button>
        </div>
      </main>
    );
  }

  const status = busy
    ? checkingPhoto ? `사진 준비 중…${progress}` : "링크 만드는 중…"
    : ready
      ? <>링크 준비됨<span className="status-extra"> · {hoursLeft(album?.expiresAt, now)}</span></>
      : dataUrl
        ? "바뀐 내용이 있어요"
        : photoCount
          ? `사진 ${photoCount}장 준비됨`
          : "이름과 사진을 정하세요";

  return (
    <div className="studio-page">
      <header className="studio-header">
        {/* Plain links reload the page, so a fresh draft never inherits state
            from an album whose address was switched in place after saving. */}
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- full reload on purpose */}
        <a href="/" className="studio-title" onClick={confirmLeave}>
          생일 사진 설정
        </a>
        <div className="studio-header-actions">
          {album ? (
            <Button variant="ghost" asChild>
              {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- full reload on purpose */}
              <a href="/" onClick={confirmLeave}><Plus />새로 만들기</a>
            </Button>
          ) : (
            <Button variant="ghost" onClick={() => setLoadOpen(true)}><FolderOpen />불러오기</Button>
          )}
          <ThemeToggle />
        </div>
      </header>

      <main className="studio">
        {!album && recent.length > 0 && (
          <section className="resume" aria-labelledby="resume-heading">
            <h2 id="resume-heading">이 브라우저에서 만든 링크</h2>
            <ul>
              {recent.map((entry) => (
                <li key={entry.id}>
                  <Link href={`/edit/${entry.id}#key=${recalledToken(entry.id) ?? ""}`} onClick={confirmLeave}>
                    <strong>{entry.nickname.trim() || "이름 없음"}</strong>
                    <span>
                      사진 {entry.photoCount ?? 0}장 · {entry.revision > 0 ? formatRelativeTime(entry.updatedAt, now) : "저장 전"}
                    </span>
                    <span className="resume-action">이어서 수정</span>
                  </Link>
                  <button type="button" className="resume-delete" aria-label={`${entry.nickname || "이름 없음"} 삭제`}
                    title="삭제" onClick={() => void deleteRecent(entry)}>
                    <Trash2 size={16} />
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="card" aria-labelledby="name-heading">
          <div className="card-head">
            <span className="step" aria-hidden="true">1</span>
            <h2 id="name-heading"><label htmlFor="nickname">생일자 이름</label></h2>
          </div>
          <div className="name-layout">
            <div className="name-field">
              <Input
                ref={nameInput}
                id="nickname"
                value={nickname}
                placeholder="예: 하늘"
                autoComplete="off"
                enterKeyHint="done"
                aria-describedby="name-hint"
                aria-invalid={Boolean(nameError)}
                disabled={busy && !checkingPhoto}
                onChange={(e) => { setNickname(e.target.value); setNameError(""); markChanged(); }}
                onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
              />
              {nameError
                ? <p id="name-hint" className="field-error" role="alert">{nameError}</p>
                : <p id="name-hint" className="hint">월드 무대 간판의 HAPPY BIRTHDAY 아래에 표시돼요. 비워 둬도 돼요.</p>}
            </div>
            <NameSign name={nickname} />
          </div>
        </section>

        <section className="card" aria-labelledby="photo-heading">
          <div className="card-head">
            <span className="step" aria-hidden="true">2</span>
            <h2 id="photo-heading">사진</h2>
            <span className="count" aria-label={`사진 8칸 중 ${photoCount}칸 채움`}>{photoCount}<small>/8</small></span>
          </div>
          <div className="photo-intro">
            <p className="hint">
              액자를 눌러 사진을 넣으세요. 원하는 칸만 채워도 돼요.
              <span> 가로·세로 사진 모두 넣을 수 있어요.</span>
            </p>
            <Button variant="outline" className="add-many" disabled={busy} onClick={() => {
                if (photoCount === PANELS.length) setNotice("빈 액자가 없어요. 바꿀 액자를 눌러 한 장씩 골라 주세요.");
                else multiInput.current?.click();
              }}>
              <Images />여러 장 한 번에 넣기
            </Button>
          </div>
          {notice && <p className="photo-notice" role="status">{notice}</p>}
          <WorldScene
            photos={photos}
            onSelect={openPicker}
            onRemove={remove}
            onDropPhoto={(panel, dropped) => {
              if (dropped.length > 1) void addMany(dropped);
              else void choose(dropped[0], panel);
            }}
            disabled={busy}
            photoError={photoError}
          />
        </section>

        {album && album.revision > 0 && (
          <div className="studio-footer">
            <Button variant="ghost" className="delete-button" onClick={deleteAlbum} disabled={busy}>
              <Trash2 />사진과 링크 삭제
            </Button>
          </div>
        )}
      </main>

      <div className="action-bar">
        <div className="action-bar-inner">
          {error && (
            <div className="action-error" role="alert">
              <span>{error}</span>
              {conflict && <Button size="sm" variant="outline" onClick={reloadSaved}>최신 내용 불러오기</Button>}
            </div>
          )}
          <div className="action-row">
            <span className="step" aria-hidden="true">3</span>
            <p className={`action-status ${ready ? "ready" : ""}`} role="status">{status}</p>
            {ready && (
              <Button variant="ghost" className="action-secondary" aria-label="링크와 붙여넣는 방법 보기"
                onClick={() => { setCopyBlocked(false); setLinkOpen(true); }}>
                <Link2 /><span>링크 보기</span>
              </Button>
            )}
            <Button
              size="lg"
              className="primary-action"
              data-copied={ready && copied ? true : undefined}
              disabled={busy}
              onClick={ready ? copy : save}
            >
              {busy && !checkingPhoto ? <LoaderCircle className="spin" /> : ready ? (copied ? <Check /> : <Copy />) : null}
              {ready ? (copied ? "복사됨" : "링크 복사") : dataUrl ? "새 링크 만들기" : "링크 만들기"}
            </Button>
          </div>
        </div>
      </div>

      <input
        ref={fileInput}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => { void choose(e.target.files?.[0], uploadPanel.current); e.target.value = ""; }}
      />
      <input
        ref={multiInput}
        type="file"
        multiple
        accept="image/jpeg,image/png,image/webp"
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => { void addMany(Array.from(e.target.files ?? [])); e.target.value = ""; }}
      />
      {pendingPhoto && (
        <PhotoFramingDialog
          file={pendingPhoto.file}
          busy={busy}
          onCancel={() => setPendingPhoto(null)}
          onConfirm={(options) => void choose(pendingPhoto.file, pendingPhoto.panel, options)}
        />
      )}
      <LinkDialog
        open={linkOpen}
        url={worldUrl}
        copied={copied}
        copyBlocked={copyBlocked}
        onCopy={copy}
        onOpenChange={setLinkOpen}
      />
      <LoadDialog open={loadOpen} onOpenChange={setLoadOpen} />
    </div>
  );
}
