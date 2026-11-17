import { OrnamentRule } from '@/components/ui/Ornament';

interface IslamicDividerProps {
  className?: string;
  variant?: 'gold' | 'teal' | 'muted';
}

const COLOR: Record<NonNullable<IslamicDividerProps['variant']>, string> = {
  gold: '',
  teal: '!text-teal',
  muted: '!text-text-muted',
};

/** Decorative divider — hairline · eight-point star · hairline. */
export function IslamicDivider({ className, variant = 'gold' }: IslamicDividerProps) {
  return <OrnamentRule className={['py-2', COLOR[variant], className ?? ''].join(' ')} />;
}
