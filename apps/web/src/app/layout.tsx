import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { AuthProvider } from '@/contexts/AuthContext';
import { OperatingProvider } from '@/contexts/OperatingContext';
import { ShellProvider } from '@/contexts/ShellContext';
import { UIVersionProvider } from '@/contexts/UIVersionContext';
import { ErrorBoundary } from '@/components/common/ErrorBoundary';
import { SentryProvider } from '@/components/providers/SentryProvider';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Canvas Memory OS',
  description: 'Graph-native knowledge management and research platform',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className={inter.className}>
        <SentryProvider>
          <ErrorBoundary>
            <AuthProvider>
              <OperatingProvider>
                <ShellProvider>
                  <UIVersionProvider>{children}</UIVersionProvider>
                </ShellProvider>
              </OperatingProvider>
            </AuthProvider>
          </ErrorBoundary>
        </SentryProvider>
      </body>
    </html>
  );
}
