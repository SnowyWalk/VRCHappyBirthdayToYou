"use client";
import { useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { ArrowRight, FolderOpen, LoaderCircle } from "lucide-react";
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
import { parseAlbumInput, readResponse, rememberToken, recalledToken } from "@/lib/client";
import type { Album } from "@/lib/panels";
import { WORLD_OVERVIEW } from "@/lib/world-view";

export function Entry() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  async function create() {
    setBusy(true);
    setError("");
    try {
      const { album, editToken } = await readResponse<{
        album: Album;
        editToken: string;
      }>(await fetch("/api/albums", { method: "POST" }));
      rememberToken(album.id, editToken);
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
