import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {
  title: 'Graqivo - Your work, connected.',
  icons: { icon: '/icon.svg', apple: '/apple-icon.png' },
  description:
    'Connect projects, resources, people, and decisions in one organized workspace.',
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link
          rel="preload"
          href="/fonts/InterVariable.woff2"
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
        />
      </head>
      <body>
        <a className="skip" href="#main">
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}
