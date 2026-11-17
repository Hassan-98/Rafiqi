import { TopAppBar } from '@/components/layout/TopAppBar';
import { EmptyState } from '@/components/ui/EmptyState';
import { Hourglass } from 'lucide-react';
import { useNavigate } from 'react-router';

interface ComingSoonPageProps {
  title: string;
  description?: string;
}

/**
 * Generic placeholder for routes that are part of Phase 2/3/4 but not yet
 * implemented. Keeps deep links from notification payloads / quick actions
 * from dead-ending on a 404 redirect.
 */
export function ComingSoonPage({ title, description }: ComingSoonPageProps) {
  const navigate = useNavigate();
  return (
    <div className="min-h-dvh bg-cream dark:bg-dark-bg">
      <TopAppBar title={title} subtitle="قيد الإعداد" showBack />
      <div className="p-6">
        <EmptyState
          illustration={<Hourglass size={64} className="text-gold" />}
          title={`${title} قريباً`}
          description={
            description ??
            'هذه الميزة قيد التطوير وستصلك في تحديث قادم بإذن الله. تابع التطبيق للمزيد من المميزات.'
          }
          cta={{ label: 'العودة للرئيسية', onClick: () => navigate('/') }}
        />
      </div>
    </div>
  );
}
