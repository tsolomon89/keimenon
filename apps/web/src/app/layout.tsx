import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { AuthProvider } from '@/contexts/AuthContext'
import { OperatingProvider } from '@/contexts/OperatingContext'
import { ShellProvider } from '@/contexts/ShellContext'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Canvas Memory OS',
  description: 'Graph-native knowledge management and research platform',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className="dark">
      <body className={inter.className}>
        <AuthProvider>
          <OperatingProvider>
            <ShellProvider>
              {children}
            </ShellProvider>
          </OperatingProvider>
        </AuthProvider>
      </body>
    </html>
  )
}
