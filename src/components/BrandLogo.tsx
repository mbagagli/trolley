import { PRODUCT } from "../config/product";

interface BrandLogoProps {
  showWordmark?: boolean;
}

export function BrandLogo({ showWordmark = true }: BrandLogoProps) {
  return (
    <span className="brand-logo">
      <svg
        aria-hidden="true"
        className="brand-symbol"
        focusable="false"
        viewBox="0 0 256 160"
      >
        <path
          d="M9 22h56l29 115M86 33h54l30 112M165 43h53l29 110"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="10"
        />
        <rect
          fill="currentColor"
          height="19"
          rx="3.5"
          width="20"
          x="105"
          y="59"
        />
      </svg>
      {showWordmark ? (
        <span className="brand-wordmark">{PRODUCT.name}</span>
      ) : null}
    </span>
  );
}
