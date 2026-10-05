import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Birthday World · 사진 설정",
  description: "월드 패널의 사진과 생일자 이름을 설정합니다.",
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
