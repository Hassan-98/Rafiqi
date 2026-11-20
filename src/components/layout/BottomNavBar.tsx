import React from 'react';
import { NavLink, useLocation } from 'react-router';
import { Home, BookOpen, Sparkles, MoonStar, ListChecks, UserRound } from 'lucide-react';
import { hapticsService } from '@/services/HapticsService';
import { useBadgeStore, unseenBadgeCount } from '@/store/badgeStore';

interface NavItem {
  path: string;
  label: string;
  Icon: React.ComponentType<{ size?: number; strokeWidth?: number }>;
  /** Other routes that belong to this tab (highlight it there too). */
  also?: string[];
}

/**
 * The 6-tab spine (owner-approved): the four daily-worship destinations,
 * «المهام والعادات» (to-do + habits + knowledge circles) and «أنا» (stats,
 * badges, settings, every other feature).
 */
export const NAV_ITEMS: NavItem[] = [
  { path: '/', label: 'اليوم', Icon: Home },
  { path: '/quran', label: 'القرآن', Icon: BookOpen },
  { path: '/adhkar', label: 'الأذكار', Icon: Sparkles, also: ['/tasbih'] },
  // Also hosts برامج التدرّج / حلقات العلم / القضاء / محاسبة الجمعة as tabs.
  { path: '/targets', label: 'عباداتي', Icon: MoonStar, also: ['/qiyam', '/module/qiyam', '/module/fasting', '/programs', '/qada', '/friday-review', '/study/circle'] },
  // «حياتي» (was «مهام وعادات», owner 2026-11-18): المهام، العادات، حلقات العلم، المنزل، صلة الرحم.
  { path: '/study', label: 'حياتي', Icon: ListChecks, also: ['/habits', '/module/habits', '/silat'] },
  { path: '/me', label: 'أنا', Icon: UserRound, also: ['/settings', '/stats', '/more'] },
];

function activeIndexFor(pathname: string): number {
  return NAV_ITEMS.findIndex((item) => {
    if (item.path === '/') return pathname === '/';
    return [item.path, ...(item.also ?? [])].some((p) => pathname === p || pathname.startsWith(`${p}/`));
  });
}

/**
 * Main navigation. Two renders of the same items:
 *  - phones / narrow windows (<lg): a bar docked to the screen bottom;
 *  - tablet-landscape & desktop (≥lg, incl. the desktop app): a vertical rail on the
 *    inline-start edge (right side in RTL).
 */
export const BottomNavBar = React.memo(function BottomNavBar() {
  const { pathname } = useLocation();
  const activeIndex = activeIndexFor(pathname);
  // New badges since the gallery was last opened → a gold dot on «أنا».
  const unseen = useBadgeStore(unseenBadgeCount);
  const dot = (path: string) =>
    path === '/me' && unseen > 0 ? (
      <span
        aria-label="أوسمة جديدة"
        className="absolute -top-0.5 -end-1 w-2.5 h-2.5 rounded-full bg-gold ring-2 ring-white dark:ring-dark-surface"
      />
    ) : null;

  return (
    <>
      {/* A floating dock (owner 2026-11-19: tidier, and responsive): inset from the
          edges, its width capped and centred so six tabs don't drift apart on a
          tablet or a narrow desktop window; it sits above the safe-area inset.
          The active tab is a slim pill behind its icon, its label in the accent. */}
      <nav
        className="lg:hidden fixed inset-x-0 bottom-0 z-30 px-3 pointer-events-none"
        style={{ paddingBottom: 'calc(var(--safe-bottom) + 0.5rem)' }}
        aria-label="التنقل الرئيسي"
      >
        <div className="pointer-events-auto relative mx-auto max-w-[34rem] flex items-stretch h-16 px-1 rounded-[24px] bg-white/92 dark:bg-dark-surface/92 backdrop-blur-xl shadow-[var(--shadow-lg)] ring-1 ring-black/[0.06] dark:ring-white/[0.08]">
          {NAV_ITEMS.map((item, i) => {
            const active = i === activeIndex;
            const { Icon } = item;
            return (
              <NavLink
                key={item.path}
                to={item.path}
                onClick={() => void hapticsService.selection()}
                className="relative flex-1 min-w-0 flex flex-col items-center justify-center gap-1 group"
                aria-current={active ? 'page' : undefined}
              >
                <span
                  className={[
                    'relative flex items-center justify-center h-8 w-[3.25rem] max-w-full rounded-full transition-colors duration-200 motion-reduce:transition-none',
                    active
                      ? 'bg-teal/14 dark:bg-teal/22 text-teal dark:text-teal-light'
                      : 'text-text-muted group-hover:text-text-secondary group-hover:bg-teal/5',
                  ].join(' ')}
                >
                  <span className="relative inline-flex">
                    <Icon size={21} strokeWidth={active ? 2.3 : 1.9} />
                    {dot(item.path)}
                  </span>
                </span>
                <span
                  className={[
                    // One line always: six tabs share a 320px phone.
                    'max-w-full truncate px-0.5 text-[10.5px] leading-none',
                    active ? 'text-teal dark:text-teal-light font-bold' : 'text-text-muted font-medium',
                  ].join(' ')}
                >
                  {item.label}
                </span>
              </NavLink>
            );
          })}
        </div>
      </nav>

      {/* Side rail — tablet landscape / desktop */}
      <nav
        className={[
          'hidden lg:flex fixed inset-y-0 inset-s-0 z-30 w-22 flex-col items-stretch gap-1.5 pt-6 px-2',
          'bg-white/90 dark:bg-dark-surface/90 backdrop-blur-xl',
          'border-e border-black/[0.05] dark:border-white/[0.06]',
        ].join(' ')}
        aria-label="التنقل الرئيسي"
      >
        {NAV_ITEMS.map((item, i) => {
          const active = i === activeIndex;
          const { Icon } = item;
          return (
            <NavLink
              key={item.path}
              to={item.path}
              onClick={() => void hapticsService.selection()}
              className={[
                'flex flex-col items-center justify-center gap-1.5 py-3 rounded-2xl group transition-colors',
                active ? 'bg-teal/12 dark:bg-teal/20' : 'hover:bg-teal/5 dark:hover:bg-teal/10',
              ].join(' ')}
              aria-current={active ? 'page' : undefined}
            >
              <span
                className={
                  active
                    ? 'text-teal dark:text-teal-light'
                    : 'text-text-muted group-hover:text-text-secondary transition-colors'
                }
              >
                <span className="relative inline-flex">
                  <Icon size={24} strokeWidth={active ? 2.3 : 1.9} />
                  {dot(item.path)}
                </span>
              </span>
              <span
                className={[
                  // rem, like the rail's width, so «الخط: صغير» still fits on one line;
                  // a wide app font (Kufam, Noto Kufi…) wraps to two centred lines.
                  'text-[0.73rem] leading-tight text-center',
                  active ? 'text-teal dark:text-teal-light font-bold' : 'text-text-muted font-medium',
                ].join(' ')}
              >
                {item.label}
              </span>
            </NavLink>
          );
        })}
      </nav>
    </>
  );
});
