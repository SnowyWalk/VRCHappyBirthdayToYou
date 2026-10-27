import Link from "next/link";
import { Button } from "@/components/ui/button";
export default function NotFound() {
  return (
    <main className="center-state">
      <h1>페이지를 찾을 수 없어요</h1>
      <p>주소가 잘못됐거나 만료된 링크예요.</p>
      <Button asChild>
        <Link href="/">처음부터 만들기</Link>
      </Button>
    </main>
  );
}
