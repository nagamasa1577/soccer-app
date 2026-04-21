import "./globals.css"; //
export const metadata = { title: 'Soccer Scoreboard' };

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja">
      <body style={{ margin: 0, background: 'black' }}>{children}</body>
    </html>
  );
}