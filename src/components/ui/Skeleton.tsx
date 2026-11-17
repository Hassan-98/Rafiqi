interface SkeletonProps {
  className?: string;
  width?: number | string;
  height?: number | string;
  rounded?: 'sm' | 'md' | 'lg' | 'full';
  lines?: number;
}

const ROUND: Record<NonNullable<SkeletonProps['rounded']>, string> = {
  sm: 'rounded',
  md: 'rounded-md',
  lg: 'rounded-2xl',
  full: 'rounded-full',
};

/** Shimmering placeholder block used while async content loads. */
export function Skeleton({
  className,
  width,
  height = 14,
  rounded = 'md',
  lines = 1,
}: SkeletonProps) {
  if (lines > 1) {
    return (
      <div className="flex flex-col gap-2" aria-busy>
        {Array.from({ length: lines }).map((_, i) => (
          <Skeleton
            key={i}
            width={i === lines - 1 ? '70%' : '100%'}
            height={height}
            rounded={rounded}
            className={className}
          />
        ))}
      </div>
    );
  }
  return (
    <div
      aria-hidden
      className={[
        'relative overflow-hidden bg-cream-dark/60 dark:bg-dark-card/60 animate-shimmer',
        ROUND[rounded],
        className ?? '',
      ].join(' ')}
      style={{
        width: typeof width === 'number' ? `${width}px` : width,
        height: typeof height === 'number' ? `${height}px` : height,
      }}
    />
  );
}
