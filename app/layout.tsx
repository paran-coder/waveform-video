// 전체 페이지 공통 레이아웃과 메타데이터
import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "파형 영상 만들기",
  description: "음원을 올리면 파형 애니메이션을 만들어 MP4로 저장합니다. 모든 처리는 브라우저에서만 이뤄집니다.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  colorScheme: "dark",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" className="h-full">
      <head>
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css"
        />
      </head>
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
