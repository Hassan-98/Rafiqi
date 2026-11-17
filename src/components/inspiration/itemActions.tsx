import { Share } from '@capacitor/share';
import { Capacitor } from '@capacitor/core';
import { Badge } from '@/components/ui/Badge';
import { useHadithStore } from '@/store/hadithStore';
import { toast } from '@/store/toastStore';
import { toHadith } from '@/services/HadithService';
import { shareText, type InspirationItem } from '@/services/inspirationService';

export async function copyItem(i: InspirationItem): Promise<void> {
  try {
    await navigator.clipboard.writeText(shareText(i));
    toast.success('تم النسخ');
  } catch {
    toast.error('تعذّر النسخ');
  }
}

export async function shareItem(i: InspirationItem): Promise<void> {
  const text = shareText(i);
  const title = i.kind === 'ayah' ? 'آية' : 'حديث';
  try {
    if (Capacitor.isNativePlatform()) return void (await Share.share({ title, text }));
    if (navigator.share) return void (await navigator.share({ title, text }));
  } catch {
    return; // user cancelled
  }
  await copyItem(i);
}

/** Favourite state for any corpus item (hadith → full record, ayah → verse key). */
export function useItemFavorite(i: InspirationItem | null): [boolean, () => void] {
  const fav = useHadithStore((s) =>
    !i ? false : i.kind === 'ayah' ? s.ayahFavorites.includes(i.key!) : s.isFavorite(i.id),
  );
  const toggle = () => {
    if (!i) return;
    const st = useHadithStore.getState();
    if (i.kind === 'ayah') st.toggleAyahFavorite(i.key!);
    else st.toggleFavorite(toHadith(i));
  };
  return [fav, toggle];
}

export function GradeBadge({ grade }: { grade?: string }) {
  if (grade === 'sahih') return <Badge size="sm" status="done" label="صحيح" />;
  if (grade === 'hasan') return <Badge size="sm" status="pending" label="حسن" />;
  return null;
}
