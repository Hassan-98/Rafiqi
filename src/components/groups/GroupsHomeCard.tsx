import { useEffect } from 'react';
import { useNavigate } from 'react-router';
import { BookOpen, ChevronLeft, Plus, Users } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { SectionTitle } from '@/components/ui/Ornament';
import { useAuthStore } from '@/store/authStore';
import { isSupabaseConfigured } from '@/services/supabaseClient';
import { loadGroups, useGroupsStore } from '@/services/groups';
import { juzCount, membersLabel } from '@/services/groupsLogic';
import { toArabicDigits } from '@/utils/arabicFormat';

const ar = toArabicDigits;
let fetchedAt = 0;

/**
 * «مجموعاتك» on Home: up to three groups with their khatma progress and my
 * unread juz, or one line inviting to start a group. Reads the cache; refreshes
 * at most every 5 minutes. `khatma`: «الختمة الجماعية» on «القرآن» — also shown
 * to a guest who left «الترتيب» (/groups explains how to come back).
 */
export function GroupsHomeCard({ khatma = false }: { khatma?: boolean }) {
  const navigate = useNavigate();
  const list = useGroupsStore((s) => s.list);
  const status = useGroupsStore((s) => s.status);
  const ready = useAuthStore((s) => s.ready);

  useEffect(() => {
    if (!ready || Date.now() - fetchedAt < 5 * 60_000) return;
    fetchedAt = Date.now();
    void loadGroups();
  }, [ready]);

  if (!isSupabaseConfigured || status === 'missing' || (status === 'away' && !khatma)) return null;

  return (
    <section className="flex flex-col gap-2.5">
      <SectionTitle
        title={khatma ? 'الختمة الجماعية' : 'مجموعاتك'}
        subtitle={khatma ? 'ختمة تتقاسمونها مع أهلك وصحبك، جزءاً جزءاً' : 'ختمة وذكر مع أهلك وصحبك'}
        action={
          <button
            type="button"
            onClick={() => navigate('/groups')}
            className="inline-flex items-center gap-0.5 text-xs font-semibold text-teal dark:text-teal-light min-h-9 px-1"
          >
            الكل <ChevronLeft size={14} />
          </button>
        }
      />
      <Card className="p-1.5 divide-y divide-black/[0.05] dark:divide-white/[0.06]">
        {list?.length ? (
          list.slice(0, 3).map((g) => (
            <button
              key={g.id}
              type="button"
              onClick={() => navigate(`/groups?id=${g.id}`)}
              className="w-full text-start flex items-center gap-3 px-3 py-2.5 rounded-[var(--radius-inner)] hover:bg-teal/5 transition-colors"
            >
              <span className="w-9 h-9 rounded-xl bg-teal/10 text-teal dark:text-teal-light inline-flex items-center justify-center shrink-0">
                <Users size={17} aria-hidden />
              </span>
              <span className="flex-1 min-w-0">
                <span className="block truncate text-sm font-semibold text-text-primary dark:text-text-on-dark">{g.name}</span>
                <span className="block text-[11px] text-text-muted truncate">
                  {membersLabel(g.members)} · {g.khatmaOpen ? `الختمة ${ar(g.khatmaDone)} من ${ar(30)}` : 'لا ختمة جارية'}
                </span>
              </span>
              {g.myJuzLeft ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-gold/12 ring-1 ring-gold/30 px-2 min-h-6 text-[11px] font-bold text-gold-dark dark:text-gold-light shrink-0">
                  <BookOpen size={12} aria-hidden />
                  {g.myJuzLeft === 1 ? 'جزؤك ينتظرك' : `معك ${juzCount(g.myJuzLeft)}`}
                </span>
              ) : null}
            </button>
          ))
        ) : (
          <button
            type="button"
            onClick={() => navigate('/groups')}
            className="w-full text-start flex items-center gap-3 px-3 py-3 rounded-[var(--radius-inner)] hover:bg-teal/5 transition-colors"
          >
            <span className="w-9 h-9 rounded-xl bg-teal/10 text-teal dark:text-teal-light inline-flex items-center justify-center shrink-0">
              <Plus size={17} aria-hidden />
            </span>
            <span className="flex-1 min-w-0 text-[13px] text-text-secondary dark:text-text-on-dark/85 text-pretty">
              {khatma
                ? 'أنشئ مجموعة لأهلك وصحبك واختموا القرآن معاً: يأخذ كلٌّ جزءه حتى تتمّ الختمة'
                : 'أنشئ مجموعة لأهلك وصحبك: ختمة تتقاسمونها، وذكر تجتمعون عليه، وترتيب بينكم'}
            </span>
            <ChevronLeft size={16} className="text-text-muted shrink-0" aria-hidden />
          </button>
        )}
      </Card>
    </section>
  );
}
