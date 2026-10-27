"use client";
import { useRef } from "react";
import Image from "next/image";
import assets from "@/lib/assets.json";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type LinkDialogProps = {
  open: boolean;
  url: string;
  copied: boolean;
  copyBlocked: boolean;
  onCopy: () => void;
  onOpenChange: (open: boolean) => void;
};

export function LinkDialog({ open, url, copied, copyBlocked, onCopy, onOpenChange }: LinkDialogProps) {
  const field = useRef<HTMLInputElement>(null);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="link-dialog" onOpenAutoFocus={(event) => {
        // Keep focus on the copy action; when copying was blocked, select the
        // link so Ctrl+C works immediately.
        if (copyBlocked) { event.preventDefault(); field.current?.focus(); field.current?.select(); }
      }}>
        <DialogHeader>
          <DialogTitle>{copied ? "링크를 복사했어요" : "링크가 만들어졌어요"}</DialogTitle>
          <DialogDescription>
            월드의 <strong>생일 사진 설정</strong> 판에서 아래 칸에 붙여넣고 OK를 누르세요.
          </DialogDescription>
        </DialogHeader>
        {/* The world's "아틀라스 이미지 URL" row, cropped from the in-world settings board. */}
        <div className="url-field-guide" aria-hidden="true">
          <Image src={assets.urlField} alt="" fill unoptimized sizes="520px" />
          <span className="url-field-highlight" />
          <span className="url-field-callout">여기에 붙여넣기 (Ctrl+V)</span>
        </div>
        <div className="link-copy-row">
          <label className="sr-only" htmlFor="world-url">월드에 붙여넣을 링크</label>
          <input
            ref={field}
            id="world-url"
            readOnly
            value={url}
            onFocus={(event) => event.currentTarget.select()}
          />
          <Button type="button" onClick={onCopy} className="link-copy-button" data-copied={copied || undefined}>
            {copied ? <Check /> : <Copy />}
            {copied ? "복사됨" : "복사"}
          </Button>
        </div>
        {copyBlocked && (
          <p className="link-copy-blocked" role="alert">
            브라우저가 자동 복사를 막았어요. 선택된 링크를 Ctrl+C(맥은 ⌘C)로 복사해 주세요.
          </p>
        )}
        <ul className="link-notes">
          <li>링크는 24시간 동안 쓸 수 있어요. 이후엔 사진과 함께 삭제돼요.</li>
          <li>사진이나 이름을 바꾸면 새 링크가 만들어져요. 월드에 다시 붙여넣어 주세요.</li>
        </ul>
        <Button type="button" variant="outline" className="link-done" onClick={() => onOpenChange(false)}>
          확인
        </Button>
      </DialogContent>
    </Dialog>
  );
}
