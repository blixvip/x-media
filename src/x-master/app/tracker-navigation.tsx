"use client";

import Link from 'next/link';
import { trackerSourceUrl, type TrackerSource } from '../lib/tracker-navigation';
import styles from './tracker-navigation.module.css';

/** Product-level navigation shared by the original dashboard and the X workspace. */
export function TrackerNavigation({ area, source = 'all', overview = false, chooseXView }: { area: 'public' | 'x'; source?: TrackerSource; overview?: boolean; chooseXView?: (view: 'posts' | 'saved') => void }) {
  const links = [
    { href: '/tools', label: 'Overview', icon: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z', active: area === 'public' && overview },
    { href: '/x-master?view=posts', label: 'X Master', icon: 'M4 4h4l12 16h-4L4 4M20 4 4 20', active: area === 'x' },
    { href: `/tools${trackerSourceUrl('hacker_news').slice(1)}`, label: 'Hacker News', icon: 'm5 4 7 9 7-9M12 13v7', active: area === 'public' && source === 'hacker_news' },
    { href: `/tools${trackerSourceUrl('github').slice(1)}`, label: 'GitHub', icon: 'm8 5-6 7 6 7M16 5l6 7-6 7M14 3l-4 18', active: area === 'public' && source === 'github' },
    { href: '/x-master?view=saved', label: 'Reference library', icon: 'M6 3h12v18l-6-4-6 4z', active: false },
  ];
  return <section className={styles.product} aria-label="X Master sections">
    <p className={styles.label}>X Master</p>
    {links.map(link => <Link className={styles.link} href={link.href} aria-current={link.active ? 'page' : undefined} key={link.label} onClick={event => {
      // The original dashboard owns URL state through popstate, not router search hooks.
      // Keep same-page source changes immediate while preserving modified-click/new-tab behavior.
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      if (area === 'x' && chooseXView && link.href.startsWith('/x-master?view=')) {
        event.preventDefault();
        chooseXView(link.href.endsWith('view=saved') ? 'saved' : 'posts');
        return;
      }
      if (area !== 'public' || !(link.href === '/tools' || link.href.startsWith('/tools?'))) return;
      event.preventDefault();
      if (`${window.location.pathname}${window.location.search}` !== link.href) window.history.pushState({ ...window.history.state }, '', link.href);
      window.dispatchEvent(new PopStateEvent('popstate', { state: window.history.state }));
      event.currentTarget.closest('details')?.removeAttribute('open');
      document.getElementById('main-content')?.focus({ preventScroll: true });
    }}><svg viewBox="0 0 24 24" aria-hidden="true"><path d={link.icon}/></svg><span>{link.label}</span></Link>)}
  </section>;
}
