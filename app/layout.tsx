import type { Metadata, Viewport } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import { EnvironmentBanner } from '@/components/layout/EnvironmentBanner'
import { ThemeProvider } from '@/components/theme-provider'
import { ResizeObserverFix } from '@/components/resize-observer-fix'
import { Toaster } from '@/components/ui/sonner'
import './globals.css'

const _geist = Geist({ subsets: ["latin"] });
const _geistMono = Geist_Mono({ subsets: ["latin"] });

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  userScalable: true,
}

export const metadata: Metadata = {
  title: 'RaroGestão',
  description: 'Sistema de Gestão Administrativa da Rarotec',
  generator: 'v0.app',
  icons: {
    icon: [
      { url: '/favicon.ico?v=8', sizes: 'any' },
      { url: '/favicon.png?v=8', type: 'image/png' },
      { url: '/icon-light-32x32.png?v=8', type: 'image/png', sizes: '32x32' },
    ],
    shortcut: '/favicon.png?v=8',
    apple: [
      { url: '/apple-icon.png?v=8', sizes: '180x180', type: 'image/png' },
    ],
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="pt-BR" className="bg-background" suppressHydrationWarning>
      <body className="font-sans antialiased">
        <ThemeProvider defaultTheme="dark">
          <ResizeObserverFix />
          <EnvironmentBanner />
          {children}
          <Toaster richColors position="top-center" />
          {process.env.NODE_ENV === 'production' && <Analytics />}
        </ThemeProvider>
      </body>
    </html>
  )
}
