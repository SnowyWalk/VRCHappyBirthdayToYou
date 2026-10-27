"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { parseAlbumInput, readResponse, recalledToken } from "@/lib/client";

export function LoadDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const router = useRouter();
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function load(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const parsed = parseAlbumInput(input);
      let id: string;
      let token: string | undefined;
      if ("atlasId" in parsed) {
        const { ids } = await readResponse<{ ids: string[] }>(await fetch(`/api/albums/resolve?atlas=${parsed.atlasId}`));
        const owned = ids.filter((candidate) => recalledToken(candidate));
        if (!owned.length)
          throw new Error("이 브라우저에는 수정 권한이 없어요. 링크를 만든 브라우저에서 열거나, 편집 링크(#key=…)를 넣어 주세요.");
        if (owned.length > 1)
          throw new Error("같은 사진을 쓰는 링크가 여러 개 있어요. 수정할 링크의 편집 링크를 넣어 주세요.");
        id = owned[0];
        token = recalledToken(id) ?? undefined;
      } else {
        ({ id, token } = parsed);
      }
      onOpenChange(false);
      router.push(`/edit/${id}${token ? `#key=${token}` : ""}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { setError(""); onOpenChange(next); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>만들었던 링크 불러오기</DialogTitle>
          <DialogDescription>월드에 붙여넣었던 링크를 넣으면 이어서 수정할 수 있어요.</DialogDescription>
        </DialogHeader>
        <form onSubmit={load} className="load-form">
          <label htmlFor="album-link" className="sr-only">월드에 붙여넣었던 링크</label>
          <Input
            id="album-link"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="https://…/party/…/atlas.png?name=…"
            required
            autoFocus
          />
          {error && <p className="field-error" role="alert">{error}</p>}
          <Button type="submit" disabled={busy}>
            {busy ? "불러오는 중…" : "불러오기"}
            <ArrowRight />
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
