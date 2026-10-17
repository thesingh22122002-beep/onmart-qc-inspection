import './fonts.css';

export const metadata = {
  title: 'ON MART — ប្រព័ន្ធត្រួតពិនិត្យគុណភាពហាង',
  description: 'ON MART QC Store Inspection System'
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#0f172a'
};

export default function RootLayout({ children }) {
  return (
    <html lang="km">
      <head>
        <link rel="manifest" href="/manifest.webmanifest" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <link rel="icon" href="/icon-192.png" />
        <link rel="preload" href="/NotoSansKhmer-Regular.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-title" content="ON MART QC" />
      </head>
      <body>{children}</body>
    </html>
  );
}
