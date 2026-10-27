import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "생일 사진 설정 · Birthday World",
  description: "생일 월드에 띄울 이름과 사진을 정하고 링크를 만듭니다.",
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: `try{var theme=localStorage.getItem('birthday-world-theme');document.documentElement.classList.toggle('dark',theme==='dark'||(theme!=='light'&&matchMedia('(prefers-color-scheme: dark)').matches))}catch{document.documentElement.classList.toggle('dark',matchMedia('(prefers-color-scheme: dark)').matches)}` }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
