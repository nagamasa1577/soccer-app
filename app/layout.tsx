// ... existing code ...
import "./globals.css";

export const metadata = { title: 'Soccer Scoreboard' };

// --- ▼ ここから追加 ▼ ---
export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 10,
  userScalable: true,
};
// --- ▲ ここまで追加 ▲ ---

export default function RootLayout({ children }) {
// ... existing code ...