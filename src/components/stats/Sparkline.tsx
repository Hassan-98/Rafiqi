interface SparklineProps {
  points: number[];
  color?: string;
  width?: number;
  height?: number;
  fill?: boolean;
  strokeWidth?: number;
}

/**
 * Tiny inline trend line with no axes — used inside KPI tiles and portal
 * cards. Renders nothing meaningful for <2 points (just a flat baseline).
 */
export function Sparkline({
  points,
  color = 'var(--color-teal)',
  width = 64,
  height = 22,
  fill = false,
  strokeWidth = 1.5,
}: SparklineProps) {
  if (points.length === 0) {
    return <svg width={width} height={height} aria-hidden="true" />;
  }

  const max = Math.max(...points, 1);
  const min = Math.min(...points, 0);
  const span = max - min || 1;
  const stepX = points.length > 1 ? width / (points.length - 1) : width;

  const coords = points.map((p, i) => {
    const x = width - i * stepX; // RTL: oldest on the right, latest (dot) on the left
    const y = height - ((p - min) / span) * (height - strokeWidth * 2) - strokeWidth;
    return [x, y] as const;
  });

  const linePath = coords
    .map(([x, y], i) => `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`)
    .join(' ');
  const areaPath = `${linePath} L 0 ${height} L ${width} ${height} Z`;

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      {fill ? <path d={areaPath} fill={color} opacity={0.12} /> : null}
      <path
        d={linePath}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {coords.length > 0 ? (
        <circle cx={coords[coords.length - 1][0]} cy={coords[coords.length - 1][1]} r={strokeWidth + 0.5} fill={color} />
      ) : null}
    </svg>
  );
}
