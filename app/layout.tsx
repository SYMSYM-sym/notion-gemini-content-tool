import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Content Generator — Notion × Gemini',
  description: 'Generate Instagram content images from your Notion content calendar using Google Gemini',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
