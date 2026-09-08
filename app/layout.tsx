import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {
  metadataBase: new URL(
    'https://skailiner-counterbalance.static.hf.space',
  ),
  title: 'COUNTERBALANCE — Fair Comparison Lab',
  description:
    'Design a blocked comparison, reproduce group assignments, and examine evidence with transparent browser-local randomization tests.',
};
export default function Layout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
