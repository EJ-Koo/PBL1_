import type { PropsWithChildren } from 'react';
import { ScrollViewStyleReset } from 'expo-router/html';
import { Helmet } from 'expo-router/vendor/react-helmet-async/lib';

const TITLE = '오늘의 별일';
const DESCRIPTION = '기록할수록 커지는 나만의 우주';
const SITE_URL = 'https://star2day.com/';
const IMAGE_URL = 'https://star2day.com/share-planet-v1.png';

// This document is rendered into every exported HTML page. Link-preview bots
// can read the brand metadata without JavaScript or an authenticated session.
export default function RootHtml({ children }: PropsWithChildren) {
  return (
    <html lang="ko">
      <head>
        {/* Register with the same Helmet instance used by Expo SDK 57's static
            renderer. The document has no focused route for expo-router/head. */}
        <Helmet><title>{TITLE}</title></Helmet>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <meta name="description" content={DESCRIPTION} />
        <meta name="application-name" content={TITLE} />
        <meta name="theme-color" content="#030516" />
        <meta property="og:type" content="website" />
        <meta property="og:locale" content="ko_KR" />
        <meta property="og:site_name" content={TITLE} />
        <meta property="og:title" content={TITLE} />
        <meta property="og:description" content={DESCRIPTION} />
        <meta property="og:url" content={SITE_URL} />
        <meta property="og:image" content={IMAGE_URL} />
        <meta property="og:image:secure_url" content={IMAGE_URL} />
        <meta property="og:image:type" content="image/png" />
        <meta property="og:image:width" content="1254" />
        <meta property="og:image:height" content="1254" />
        <meta property="og:image:alt" content="보라빛 행성과 빛나는 고리로 표현한 오늘의 별일 로고" />
        <meta name="twitter:card" content="summary" />
        <meta name="twitter:title" content={TITLE} />
        <meta name="twitter:description" content={DESCRIPTION} />
        <meta name="twitter:image" content={IMAGE_URL} />
        <meta name="twitter:image:alt" content="오늘의 별일 행성 로고" />
        <link rel="apple-touch-icon" href="/share-planet-v1.png" />
        <ScrollViewStyleReset />
      </head>
      <body>{children}</body>
    </html>
  );
}
