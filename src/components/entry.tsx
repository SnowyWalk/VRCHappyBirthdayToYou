"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { ArrowRight, FolderOpen, LoaderCircle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Brand } from "@/components/brand";
import { ThemeToggle } from "@/components/theme-toggle";
import { parseAlbumInput, readResponse, rememberAlbum, recalledToken, refreshRecentAlbums, readRecentAlbums, formatRelativeTime, deleteSavedAlbum, type RecentAlbum } from "@/lib/client";
import type { Album } from "@/lib/panels";
import { WORLD_OVERVIEW } from "@/lib/world-view";

export function Entry() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [recent, setRecent] = useState<RecentAlbum[]>([]);
  const [now, setNow] = useState(0);
  useEffect(() => {
    let cancelled = false;
    void refreshRecentAlbums().then(albums => {
      if (!cancelled) { setRecent(albums); setNow(Date.now()); }
    });
    const timer = setInterval(() => { setRecent(readRecentAlbums()); setNow(Date.now()); }, 1000);
    return () => { cancelled = true; clearInterval(timer); };
  }, []);
  async function removeAlbum(album: RecentAlbum) {
    if (busy || !window.confirm("이 앨범의 사진과 링크를 서버에서 삭제할까요? 삭제한 데이터는 복구할 수 없습니다.")) return;
    setBusy(true);
    setError("");
    try {
      const token = recalledToken(album.id);
      if (!token) throw new Error("편집 권한을 찾을 수 없습니다.");
      await deleteSavedAlbum(album.id, token);
      setRecent(readRecentAlbums());
    } catch (error) { setError((error as Error).message); }
    finally { setBusy(false); }
  }
  async function create() {
    setBusy(true);
    setError("");
    try {
      const { album, editToken } = await readResponse<{
        album: Album;
        editToken: string;
      }>(await fetch("/api/albums", { method: "POST" }));
      rememberAlbum(album, editToken);
      router.push(`/edit/${album.id}#key=${editToken}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "앨범을 만들지 못했어요.");
      setBusy(false);
    }
  }
  async function load(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const parsed = parseAlbumInput(input);
      let id: string;
      let token: string | undefined;
      if ("atlasId" in parsed) {
        const { ids } = await readResponse<{ ids: string[] }>(
          await fetch(`/api/albums/resolve?atlas=${parsed.atlasId}`),
        );
        const owned = ids.filter((candidate) => recalledToken(candidate));
        if (!owned.length)
          throw new Error("이 브라우저에 편집 권한이 없어요. 사진을 저장했던 브라우저에서 열거나 편집 링크를 넣어 주세요.");
        if (owned.length > 1)
          throw new Error("같은 이미지를 사용하는 앨범이 여러 개 있어요. 수정할 앨범의 편집 링크를 넣어 주세요.");
        id = owned[0];
        token = recalledToken(id) ?? undefined;
      } else {
        ({ id, token } = parsed);
      }
      router.push(`/edit/${id}${token ? `#key=${token}` : ""}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="controller-page">
      <header className="controller-header">
        <Brand />
        <ThemeToggle />
      </header>
      <main className="controller-main entry-controller">
        <section className="entry-world" aria-label="월드 전경">
          <Image
            src={WORLD_OVERVIEW.image}
            alt="Birthday World의 생일 홀과 사진 갤러리"
            fill
            priority
            sizes="100vw"
          />
          <div className="entry-content">
            <h1 className="sr-only">사진 설정</h1>
            <p className="entry-expiry-note">
              저장한 사진과 링크는 24시간 뒤 자동 삭제됩니다.
            </p>
            <Button
              size="lg"
              onClick={create}
              disabled={busy}
              className="create-button"
            >
              {busy ? <LoaderCircle className="spin" /> : <ArrowRight />}
              {busy ? "만드는 중…" : "새로 만들기"}
            </Button>
            <Button
              size="lg"
              variant="ghost"
              disabled={busy}
              onClick={() => {
                setError("");
                setOpen(true);
              }}
              className="load-button"
            >
              <FolderOpen />
              불러오기
            </Button>
          </div>
        </section>
        {recent.length > 0 && <section className="recent-albums" aria-label="최근 편집 링크">
          <h2>최근 편집 링크</h2>
          <ul>{recent.map(album => <li key={album.id}>
            <Link href={`/edit/${album.id}#key=${recalledToken(album.id) ?? ""}`}>
              <div className="recent-title">
                <span className="recent-name">{album.nickname.trim() || "(이름 없음)"}</span>
                {typeof album.photoCount === "number" && <span className="recent-photo-count" title={`사진 ${album.photoCount}장 등록됨`}>{album.photoCount}/8</span>}
              </div>
              <small>{album.id}</small>
            </Link>
            {album.revision > 0 ? <time dateTime={album.updatedAt} title={new Intl.DateTimeFormat("ko-KR", { dateStyle: "full", timeStyle: "long" }).format(new Date(album.updatedAt))}>
              {formatRelativeTime(album.updatedAt, now)}
            </time> : <span className="recent-unsaved">아직 저장하지 않음</span>}
            <button type="button" className="recent-delete" disabled={busy}
              aria-label={`${album.nickname || album.id} 앨범 삭제`} title="서버에서 앨범 삭제" onClick={() => void removeAlbum(album)}><X size={16} /></button>
          </li>)}</ul>
        </section>}
        {error && !open && (
          <p className="error-message" role="alert">
            {error}
          </p>
        )}
      </main>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>불러오기</DialogTitle>
            <DialogDescription>
              월드에 사용한 링크를 붙여 넣으세요.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={load} className="load-form">
            <label htmlFor="album-link">앨범 링크 또는 UUID</label>
            <Input
              id="album-link"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="월드용 이미지 링크"
              required
              autoFocus
            />
            {error && (
              <p className="error-message" role="alert">
                {error}
              </p>
            )}
            <Button type="submit" disabled={busy}>
              {busy ? "불러오는 중…" : "불러오기"}
              <ArrowRight size={16} />
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
