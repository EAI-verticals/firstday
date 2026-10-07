import 'reflect-metadata';
import type { Metadata } from 'next';
import { Geist } from 'next/font/google';
import { headers } from 'next/headers';
import Script from 'next/script';

import './globals.css';
import './firstday.css';
import { Providers } from './providers';
import { tenantConfigs } from '@/eai.config';

// Fonts
const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'Firstday — Your onboarding workspace',
  description:
    'A confident start: understand your workplace, prepare your documents, and complete onboarding.',
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const allHeaders = await headers();
  const nonce = allHeaders.get('x-nonce') ?? '';

  return (
    <html lang='en' suppressHydrationWarning>
      <head>
        <link
          rel='icon'
          href={`${(process.env.NEXT_PUBLIC_APP_BASE_PATH || '').replace(/\/$/, '')}/firstday-logo.svg?v=sunrise`}
          type='image/svg+xml'
        />
        <Script id='init' nonce={nonce} strategy='afterInteractive'>
          {`console.log("Nonce is attached securely!")`}
        </Script>
      </head>
      <body className={`${geistSans.variable} antialiased`}>
        <Providers tenants={tenantConfigs}>{children}</Providers>
      </body>
    </html>
  );
}
