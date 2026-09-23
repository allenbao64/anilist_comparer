import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'AniList Comparer - Jeopardy Edition',
  description: 'Compare AniList user lists for your next Jeopardy game!',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
