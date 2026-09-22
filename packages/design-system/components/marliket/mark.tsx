import type { SVGProps } from "react";

type MarkProps = {
  size?: number;
  color?: string;
} & Omit<SVGProps<SVGSVGElement>, "color">;

/**
 * Marliket brand mark — lowercase "t" with the signature curled descender.
 * Per brand guide §5: 2.6px rounded stroke, optical weight matched to
 * its container. Defaults to Marliket Red.
 */
export const MarliketMark = ({
  size = 22,
  color = "var(--marliket-red, #d4231c)",
  ...rest
}: MarkProps) => (
  <svg
    aria-label="Marliket"
    fill="none"
    height={size}
    viewBox="0 0 24 24"
    width={size}
    {...rest}
  >
    <path
      d="M9.8 3.5 L9.8 6.2 L6.5 6.2 L6.5 9.0 L9.8 9.0 L9.8 16.5 C 9.8 18.4 10.6 19.4 11.9 19.9 C 13.4 20.5 15.3 20.0 16.6 18.6"
      fill="none"
      stroke={color}
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2.6"
    />
    <line
      stroke={color}
      strokeLinecap="round"
      strokeWidth="2.6"
      x1="11"
      x2="17"
      y1="6.2"
      y2="6.2"
    />
  </svg>
);

interface WordmarkProps {
  className?: string;
  markColor?: string;
  scale?: number;
}

/**
 * Marliket wordmark — bold lowercase Inter pair with the mark.
 * Marks default to Marliket Red on neutral, with the text inheriting
 * the surrounding ink color so it works in light + dark surfaces.
 */
export const MarliketWordmark = ({
  scale = 1,
  markColor,
  className,
}: WordmarkProps) => (
  <span
    className={className}
    style={{
      alignItems: "center",
      display: "inline-flex",
      fontFamily: "var(--font-inter), Inter, sans-serif",
      fontSize: 20 * scale,
      fontWeight: 700,
      gap: 8 * scale,
      letterSpacing: "-0.025em",
      lineHeight: 1,
    }}
  >
    <MarliketMark color={markColor} size={22 * scale} />
    marliket
  </span>
);
