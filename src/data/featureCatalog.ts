import type { LucideIcon } from 'lucide-react';
import {
  BookOpen, Download, MoonStar, Moon, Star,
  Hand, Compass, MapPin, CalendarDays, BookHeart, HandHeart, Sparkles, ScrollText,
  Coins, Gift, Award, Trophy, BarChart3, Settings, Cloud, Target, UserRound, GraduationCap, ListChecks, Library,
} from 'lucide-react';
import { Mosque } from '@/components/icons/Mosque';

export interface FeatureItem {
  id: string;
  label: string;
  to: string;
  Icon: LucideIcon;
  /** Optional one-line description for the hub. */
  hint?: string;
}

export interface FeatureCategory {
  id: string;
  title: string;
  items: FeatureItem[];
}

/**
 * Single source of truth for every feature in the app + its route. Drives the
 * "المزيد" features hub (so nothing is buried / unreachable) and the home-page
 * shortcuts. Keep in sync with the routes in App.tsx.
 */
export const FEATURE_CATEGORIES: FeatureCategory[] = [
  {
    id: 'quran',
    title: 'القرآن',
    items: [
      { id: 'mushaf', label: 'مصحفي', to: '/quran', Icon: BookOpen, hint: 'الورد والختمات من مصحفي' },
      { id: 'downloads', label: 'التنزيلات', to: '/downloads', Icon: Download, hint: 'الأذكار الصوتية دون إنترنت' },
    ],
  },
  {
    id: 'worship',
    title: 'العبادات',
    items: [
      { id: 'prayers', label: 'الصلاة', to: '/module/prayers', Icon: Mosque },
      { id: 'dhikr', label: 'الأذكار', to: '/adhkar', Icon: Sparkles },
      { id: 'qiyam', label: 'قيام الليل', to: '/targets?tab=qiyam', Icon: MoonStar, hint: 'سجّل قيامك ليلة بليلة' },
      { id: 'fasting', label: 'الصيام', to: '/module/fasting', Icon: Moon },
      { id: 'habits', label: 'العادات', to: '/study?tab=habits', Icon: Star },
    ],
  },
  {
    id: 'tools',
    title: 'أدوات',
    items: [
      { id: 'tasbih', label: 'التسبيح', to: '/tasbih', Icon: Hand },
      { id: 'qibla', label: 'القبلة', to: '/qibla', Icon: Compass },
      { id: 'mosques', label: 'المساجد القريبة', to: '/mosques', Icon: MapPin },
      { id: 'calendar', label: 'التقويم', to: '/calendar', Icon: CalendarDays, hint: 'هجري وميلادي ومناسبات كل يوم' },
    ],
  },
  {
    id: 'study',
    title: 'العلم والمهام',
    items: [
      { id: 'study', label: 'حلقات العلم', to: '/study?tab=circles', Icon: GraduationCap, hint: 'دروسك على تيليجرام ويوتيوب وغيرها' },
      { id: 'tasks', label: 'مهامي', to: '/study?tab=tasks', Icon: ListChecks, hint: 'قائمة مهام بتنبيهات' },
    ],
  },
  {
    id: 'dua',
    title: 'الأدعية والتعلّم',
    items: [
      { id: 'duaa-library', label: 'الأدعية', to: '/duaa-library', Icon: BookHeart, hint: 'حصن المسلم' },
      { id: 'duaa-journal', label: 'دعائي', to: '/module/duaa', Icon: HandHeart, hint: 'مفكرة الدعاء' },
      { id: 'asma', label: 'أسماء الله الحسنى', to: '/asma', Icon: Sparkles },
      { id: 'sunnah', label: 'الحديث النبوي', to: '/sunnah', Icon: Library, hint: 'الكتب التسعة مع البحث' },
      { id: 'hadith', label: 'حديث وآية', to: '/hadith', Icon: ScrollText, hint: 'لكل يوم' },
    ],
  },
  {
    id: 'charity',
    title: 'الزكاة والصدقة',
    items: [
      { id: 'zakat', label: 'حاسبة الزكاة', to: '/zakat', Icon: Coins },
      { id: 'sadaqah', label: 'الصدقة', to: '/sadaqah', Icon: Gift },
    ],
  },
  {
    id: 'app',
    title: 'الإنجازات والتطبيق',
    items: [
      { id: 'targets', label: 'الأوراد', to: '/targets', Icon: Target, hint: 'أوراد متجددة بتذكير وترحيل' },
      { id: 'badges', label: 'الأوسمة', to: '/badges', Icon: Award },
      { id: 'leaderboard', label: 'الترتيب', to: '/leaderboard', Icon: Trophy, hint: 'نافِس في الخير يومياً وأسبوعياً' },
      { id: 'stats', label: 'الإحصاءات العامة', to: '/stats', Icon: BarChart3, hint: 'الصورة الكاملة لعبادتك' },
      { id: 'me', label: 'أنا', to: '/me', Icon: UserRound, hint: 'إحصاءاتك وأوسمتك وإعداداتك' },
      { id: 'settings', label: 'الإعدادات', to: '/settings', Icon: Settings },
      { id: 'backup', label: 'النسخ الاحتياطي', to: '/backup', Icon: Cloud },
    ],
  },
];

/** Flat list of all features (for search). */
export const ALL_FEATURES: FeatureItem[] = FEATURE_CATEGORIES.flatMap((c) => c.items);
