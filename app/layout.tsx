// @ts-nocheck
import "./globals.css";

export const metadata = { title: 'Soccer Scoreboard' };

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 10,
  userScalable: true,
};

export default function RootLayout({ children }) {
  return (
    <html lang="ja">
      <body style={{ margin: 0, background: 'black' }}>
        {children}
      </body>
    </html>
  );
}