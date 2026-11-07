import type { Metadata } from 'next';
import '@/x-master/tokens.css';
import '@/x-master/app/x-media-theme.css';

export const metadata: Metadata = { title: 'X Master', description: 'Trending, drafts, saved videos and your X Master tools in X Media.' };
export default function MasterLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
