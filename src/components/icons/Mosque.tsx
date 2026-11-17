import { forwardRef } from 'react';
import type { LucideIcon, LucideProps } from 'lucide-react';

/**
 * A mosque line-icon (lucide doesn't ship one) — a central domed hall with an
 * arched entrance, a crescent finial, and two minarets. Drawn to match lucide's
 * 24×24 stroke style so it drops into the same `Icon` slots.
 */
export const Mosque = forwardRef<SVGSVGElement, LucideProps>(function Mosque(
  { size = 24, strokeWidth = 2, color = 'currentColor', absoluteStrokeWidth: _abs, ...rest },
  ref,
) {
  return (
    <svg
      ref={ref}
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...rest}
    >
      {/* ground */}
      <path d="M3 21h18" />
      {/* minarets */}
      <path d="M5.5 21V10" />
      <path d="M18.5 21V10" />
      <circle cx="5.5" cy="8.2" r="1.5" />
      <circle cx="18.5" cy="8.2" r="1.5" />
      {/* domed hall */}
      <path d="M8 21v-7h8v7" />
      <path d="M8 14a4 4 0 0 1 8 0" />
      {/* crescent finial */}
      <path d="M12 10V7" />
      <path d="M11 6.5a1.3 1.3 0 1 0 1.6-1.3 1 1 0 0 1-1.6 1.3Z" />
      {/* arched door */}
      <path d="M10.5 21v-3.2a1.5 1.5 0 0 1 3 0V21" />
    </svg>
  );
}) as unknown as LucideIcon;
