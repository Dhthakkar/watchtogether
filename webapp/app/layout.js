import './globals.css';

export const metadata = {
  title: 'WatchTogether',
  description: 'Watch parties for couples and friend groups',
  manifest: '/manifest.json',
};

export const viewport = {
  themeColor: '#e50914',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
