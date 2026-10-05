import Link from "next/link";
import { Brand } from "@/components/brand";
import { Button } from "@/components/ui/button";
export default function NotFound() {
  return (
    <main className="center-state">
      <Brand />
      <h1>이 페이지를 찾을 수 없어요.</h1>
      <p>처음으로 돌아가 새 앨범을 만들거나 저장한 링크를 불러오세요.</p>
      <Button asChild>
        <Link href="/">처음으로</Link>
      </Button>
    </main>
  );
}
