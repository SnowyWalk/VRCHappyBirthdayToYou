"use client";
import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Copy,
  LoaderCircle,
  Save,
} from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Brand } from "@/components/brand";
import { ThemeToggle } from "@/components/theme-toggle";
import { WorldScene } from "@/components/world-scene";
import { PANELS, type Album, type PanelId } from "@/lib/panels";
import { preparePhoto } from "@/lib/prepare-photo";
import {
  copyText,
  readResponse,
  rememberAlbum,
  deleteSavedAlbum,
  recalledToken,
  ResponseError,
  withNickname,
} from "@/lib/client";

function validatedName(value: string) {
  const name = value.trim().normalize("NFC");
  if (new TextEncoder().encode(name).length > 128) {
    throw new Error("이름은 UTF-8 128바이트 이하로 입력해 주세요. 한글은 보통 42자까지 사용할 수 있어요.");
  }
  if (/[\u0000-\u001f\u007f]/.test(value)) {
    throw new Error("이름에 줄바꿈이나 제어 문자를 사용할 수 없어요.");
  }
  return name;
}

const STEPS = ["이름 입력", "사진 등록", "링크 복사"] as const;

export function AlbumEditor({ id }: { id: string }) {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [nameComplete, setNameComplete] = useState(false);
  const nameInput = useRef<HTMLInputElement>(null);
  const stageHeading = useRef<HTMLHeadingElement>(null);
  const errorBanner = useRef<HTMLDivElement>(null);
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
  async function deleteCurrentAlbum() {
    if (busy || !window.confirm("이 앨범의 사진과 링크를 서버에서 삭제할까요? 저장하지 않은 변경 사항도 사라지며, 삭제한 데이터는 복구할 수 없습니다.")) return;
    setBusy(true);
    setError("");
    try {
      await deleteSavedAlbum(id, token);
      setDirty(false);
      router.replace("/");
    } catch (error) { setError((error as Error).message); setBusy(false); }
  }
  const worldUrl = withNickname(dataUrl, album?.nickname ?? "");
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
          rememberAlbum(loaded, key);
          setAlbum(loaded);
          setNickname(loaded.nickname);
          setDataUrl(publicUrl ?? "");
          setNameComplete(loaded.revision > 0);
          setStep(loaded.revision > 0 ? 2 : 1);
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
  useEffect(() => {
    if (loading || !album) return;
    const target = step === 1 ? nameInput.current : stageHeading.current;
    target?.focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: "instant" });
    // Focus only when a new stage opens, never on save or typing within it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, loading]);
  useEffect(() => {
    if (error) errorBanner.current?.scrollIntoView({ block: "nearest", behavior: "instant" });
  }, [error]);
  function goToStep(next: 1 | 2 | 3) {
    if (next === step) return;
    if (busy || (next === 2 && !nameComplete) || (next === 3 && (!dataUrl || dirty))) return;
    if (next === 2 && step === 1) {
      try { validatedName(nickname); }
      catch (error) { setError((error as Error).message); nameInput.current?.focus(); return; }
    }
    setError("");
    setCopied("");
    setStep(next);
  }
  function nextFromName(event: React.FormEvent) {
    event.preventDefault();
    try {
      validatedName(nickname);
      setError("");
      setNameComplete(true);
      setStep(2);
    } catch (error) {
      setError((error as Error).message);
      nameInput.current?.focus();
    }
  }
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
    choosingPhoto.current = true;
    setBusy(true);
    setCheckingPhoto(true);
    let url: string;
    try {
      const prepared = await preparePhoto(file);
      file = prepared.file;
      url = URL.createObjectURL(file);
      setOrientations(prev => ({ ...prev, [panel]: prepared.orientation }));
    } catch (e) {
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
    if (!album || busy) return;
    if (dataUrl && !dirty) { goToStep(3); return; }
    setBusy(true);
    setError("");
    try {
      const name = validatedName(nickname);
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
      rememberAlbum(updated, token);
      setDataUrl(publicUrl ?? "");
      setNickname(updated.nickname);
      setFiles({});
      setRemoved([]);
      setPreviews({});
      setOrientations({});
      for (const url of objectUrls.current) URL.revokeObjectURL(url);
      objectUrls.current.clear();
      setDirty(false);
      setConflict(false);
      setCopied("");
      setStep(3);
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

    } catch {
      setCopied("");
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
      <main className="controller-main editor-main" data-step={step}>
        <nav className="editor-steps" aria-label="설정 순서">
          <ol>{STEPS.map((label, index) => {
            const number = (index + 1) as 1 | 2 | 3;
            const unavailable = number === 2 ? !nameComplete : number === 3 ? !dataUrl || dirty : false;
            return <li key={label}>
              <button type="button" aria-label={`${number}. ${label}`} aria-current={step === number ? "step" : undefined}
                disabled={busy || unavailable} onClick={() => goToStep(number)}>
                <span className="step-number" aria-hidden="true">{number}</span>
                <span>{label}</span>
              </button>
            </li>;
          })}</ol>
        </nav>
        {error && (
          <div ref={errorBanner} className="error-banner" role="alert">
            {error}
            {conflict && (
              <Button variant="outline" size="sm" onClick={reloadSaved}>
                최신 내용 불러오기
              </Button>
            )}
          </div>
        )}
        {step === 1 && <section className="name-step" aria-labelledby="name-heading">
          <h1 id="name-heading">생일자의 이름을 입력하세요.</h1>
          <form onSubmit={nextFromName}>
            <div className="name-control">
              <label htmlFor="nickname">생일자의 이름 <span>선택 사항</span></label>
              <Input ref={nameInput} id="nickname" placeholder="이름 입력" value={nickname} disabled={busy}
                aria-describedby="name-help" aria-invalid={Boolean(error)}
                onChange={(e) => { setNickname(e.target.value); setDirty(true); setCopied(""); setError(""); }} />
              <p id="name-help">입력한 이름이 월드에 표시됩니다. 비워 두어도 계속할 수 있어요.</p>
            </div>
            <Button type="submit" size="lg" disabled={busy} className="next-step-button">
              다음 <ArrowRight size={18} />
            </Button>
          </form>
        </section>}
        {step === 2 && <>
          <div className="photo-step-heading">
            <div>
              <h1 ref={stageHeading} tabIndex={-1}>사진을 등록하세요.</h1>
              <p>사진을 넣을 패널을 누르거나, 사진을 끌어다 놓으세요.</p>
              <p className="photo-ratio-help">가로 16:9 또는 세로 9:16 사진을 사용할 수 있어요.</p>
              <p className="mobile-panel-help">전경을 옆으로 밀거나 ‘패널 보기’를 눌러 사진을 넣으세요.</p>
            </div>
            <button className="name-summary" type="button" onClick={() => goToStep(1)} disabled={busy}>
              <span>생일자의 이름</span><strong>{nickname.trim() || "(이름 없음)"}</strong><span>수정</span>
            </button>
          </div>
          <div className="controller-workspace">
            <section className="scene-workspace" aria-label="사진 패널 선택">
              <WorldScene
                orientations={{ ...album.panelOrientations, ...orientations }}
                photos={photos} onSelect={openPicker} onRemove={remove}
                onDropPhoto={(panel, dropped) => {
                  if (dropped.length !== 1) {
                    setError("패널 하나에 사진 한 장씩 끌어 놓아 주세요.");
                    return;
                  }
                  void choose(dropped[0], panel);
                }} disabled={busy}
              />
              <p className="gallery-empty-note">모든 칸을 채울 필요는 없어요. 사진이 없는 패널은 월드에서 자동으로 제거됩니다.</p>
              <div className="photo-requirements">
                <p className="photo-requirements-title">사진 형식과 보관 기간</p>
                <p className="gallery-footnote">가로 16:9 또는 세로 9:16 · JPG, PNG, WebP · 최대 4천만 픽셀 · 업로드 전 최대 2048px로 자동 축소 · 저장 후 24시간 보관</p>
              </div>
            </section>
            <div className="controller-inspector">
              <div className="controller-save">
                <div className={`save-state ${dirty ? "unsaved" : ""}`} role="status">
                  <span />{busy ? checkingPhoto ? "사진 확인 중…" : "저장 중…" : dirty ? "저장하지 않은 변경 사항" : album.revision ? "모든 변경 사항 저장됨" : "이름과 사진을 입력하세요"}
                </div>
                <Button size="lg" onClick={save} disabled={busy} className="save-button">
                  {busy ? <LoaderCircle className="spin" size={17} /> : <Save size={17} />}
                  <span>{album.atlasId && dirty ? "변경 사항 저장" : "저장하고 링크 만들기"}</span>
                </Button>
              </div>
            </div>
          </div>
        </>}
        <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" tabIndex={-1}
          onChange={(e) => { void choose(e.target.files?.[0], uploadPanel.current); e.target.value = ""; }} />
        {step === 3 && dataUrl && <section className="link-step" aria-labelledby="link-heading">
          <h1 ref={stageHeading} tabIndex={-1} id="link-heading">링크를 복사하세요.</h1>
          <p className="link-instruction">월드의 ‘생일 사진 설정’ 패널에 붙여넣고 ‘적용’을 누르세요.</p>
          <div className="save-state" role="status"><span />모든 변경 사항 저장됨</div>
          <div className="link-result-layout">
          <div className="world-link" aria-label="월드에 적용할 링크">
            <label htmlFor="world-url">월드에 붙여 넣을 링크</label>
            <Input id="world-url" aria-label="VRChat용 이미지 링크" readOnly value={worldUrl} onFocus={(e) => e.target.select()} />
            <Button size="lg" aria-label="VRChat용 이미지 링크 복사" onClick={copy} disabled={busy || dirty} className="copy-link-button">
              {copied === "data" ? <Check size={20} /> : <Copy size={20} />}
              {copied === "data" ? "복사했어요" : "링크 복사"}
            </Button>
            <p className="link-expiry">링크는 저장 후 24시간 동안만 유효합니다. 이후에는 링크가 만료되고 사진도 삭제됩니다.</p>
          </div>
          <figure className="world-paste-guide">
            <div className="world-input-shot">
              <Image src="/world-input-panel.webp" width={1080} height={1280}
                alt="월드의 생일 사진 설정 패널에 있는 아틀라스 이미지 URL 입력칸과 적용 버튼"
                sizes="(max-width: 700px) 100vw, 600px" />
              <span className="world-input-highlight" aria-hidden="true" />
              <span className="world-paste-label">링크 붙여넣기</span>
              <svg className="world-paste-arrow" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                <path d="M50 4V90M20 65L50 94L80 65" />
              </svg>
            </div>
            <figcaption>아틀라스 이미지 URL 입력칸에 붙여넣고 <strong>적용</strong>을 누르세요.</figcaption>
          </figure>
          </div>
          <Button variant="outline" className="edit-photos-button" onClick={() => goToStep(2)} disabled={busy}><ArrowLeft size={16} />사진 수정하기</Button>
        </section>}
        <div className="editor-delete"><Button variant="ghost" className="delete-album-button" onClick={deleteCurrentAlbum} disabled={busy}>앨범 삭제</Button></div>
      </main>
    </div>
  );
}
