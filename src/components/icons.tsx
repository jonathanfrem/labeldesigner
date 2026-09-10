import type { SVGProps } from 'react';

/**
 * Small monochrome toolbar icons, 16x16, stroke=currentColor so they inherit
 * button text color (including disabled/active states) with no extra props.
 * Kept intentionally plain — line art, no fills — to match the CAD-tool
 * register CLAUDE.md's design brief asks for, not a consumer app icon set.
 */
function Icon(props: SVGProps<SVGSVGElement>) {
  return <svg width={16} height={16} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.3} strokeLinecap="round" strokeLinejoin="round" {...props} />;
}

export function RectToolIcon() {
  return (
    <Icon>
      <rect x={2.5} y={4} width={11} height={8} rx={0.5} />
    </Icon>
  );
}

export function EllipseToolIcon() {
  return (
    <Icon>
      <ellipse cx={8} cy={8} rx={5.5} ry={4} />
    </Icon>
  );
}

export function LineToolIcon() {
  return (
    <Icon>
      <line x1={2.5} y1={12} x2={13.5} y2={4} />
    </Icon>
  );
}

export function TextToolIcon() {
  return (
    <Icon>
      <path d="M3 4h10M8 4v8" />
    </Icon>
  );
}

export function BoldIcon() {
  return (
    <Icon strokeWidth={0}>
      <path
        fill="currentColor"
        d="M4.5 3.5h4a2.6 2.6 0 0 1 2.5 2.5c0 1-.5 1.7-1.2 2.1.9.4 1.6 1.2 1.6 2.4A2.6 2.6 0 0 1 8.5 13h-4V3.5Zm2 1.6v2.3h1.7a1.15 1.15 0 0 0 0-2.3H6.5Zm0 3.9v2.6h1.9a1.3 1.3 0 0 0 0-2.6H6.5Z"
      />
    </Icon>
  );
}

export function AlignLeftIcon() {
  return (
    <Icon>
      <path d="M2.5 4h11M2.5 7h7M2.5 10h11M2.5 13h7" />
    </Icon>
  );
}

export function AlignCenterIcon() {
  return (
    <Icon>
      <path d="M2.5 4h11M4.5 7h7M2.5 10h11M4.5 13h7" />
    </Icon>
  );
}

export function AlignRightIcon() {
  return (
    <Icon>
      <path d="M2.5 4h11M6.5 7h7M2.5 10h11M6.5 13h7" />
    </Icon>
  );
}

export function AlignJustifyIcon() {
  return (
    <Icon>
      <path d="M2.5 4h11M2.5 7h11M2.5 10h11M2.5 13h11" />
    </Icon>
  );
}

export function VAlignTopIcon() {
  return (
    <Icon>
      <path d="M2.5 2.5h11M5 6h2.5M5 8.5h6M5 11h4" />
    </Icon>
  );
}

export function VAlignMiddleIcon() {
  return (
    <Icon>
      <path d="M2.5 8h11M5 4.5h2.5M5 3h6M5 5.5h4M5 12.5h2.5M5 11h6M5 13.5h4" />
    </Icon>
  );
}

export function VAlignBottomIcon() {
  return (
    <Icon>
      <path d="M2.5 13.5h11M5 5h2.5M5 7.5h6M5 10h4" />
    </Icon>
  );
}
