/**
 * Line icons of the interface (24×24 grid, 1.75 stroke, `currentColor`). Decorative: the
 * control that holds one always has its own text or `aria-label`.
 */
import type { ReactNode, SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function icon(paths: ReactNode) {
  return function Icon({ size = 16, className = '', ...props }: IconProps) {
    return (
      <svg
        viewBox="0 0 24 24"
        width={size}
        height={size}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.75}
        strokeLinecap="square"
        strokeLinejoin="miter"
        aria-hidden="true"
        className={`shrink-0 ${className}`}
        {...props}
      >
        {paths}
      </svg>
    );
  };
}

export const IconPlus = icon(<path d="M12 5v14M5 12h14" />);
export const IconClose = icon(<path d="M6 6l12 12M18 6L6 18" />);
export const IconCheck = icon(<path d="M5 12.5l4.5 4.5L19 7.5" />);
export const IconArrowLeft = icon(<path d="M19 12H5M11 6l-6 6 6 6" />);
export const IconArrowRight = icon(<path d="M5 12h14M13 6l6 6-6 6" />);
export const IconChevronLeft = icon(<path d="M15 5l-7 7 7 7" />);
export const IconChevronRight = icon(<path d="M9 5l7 7-7 7" />);
export const IconChevronUp = icon(<path d="M5 15l7-7 7 7" />);
export const IconChevronDown = icon(<path d="M5 9l7 7 7-7" />);
export const IconFirst = icon(<path d="M6 5v14M18 5l-7 7 7 7" />);
export const IconLast = icon(<path d="M18 5v14M6 5l7 7-7 7" />);
export const IconUndo = icon(<path d="M9 14L4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3" />);
export const IconRewind = icon(<path d="M11 6l-7 6 7 6V6zM20 6l-7 6 7 6V6z" />);
export const IconFlag = icon(<path d="M5 21V4M5 4h12l-2.5 4.5L17 13H5" />);
export const IconExit = icon(<path d="M14 4h6v16h-6M10 8l-4 4 4 4M6 12h10" />);
export const IconDownload = icon(<path d="M12 4v11M7 10l5 5 5-5M5 20h14" />);
export const IconUpload = icon(<path d="M12 20V9M7 14l5-5 5 5M5 4h14" />);
export const IconCopy = icon(
  <>
    <path d="M8 8h11v12H8z" />
    <path d="M16 8V4H5v12h3" />
  </>,
);
export const IconTrash = icon(<path d="M4 7h16M10 7V4h4v3M6 7l1 13h10l1-13M10 11v6M14 11v6" />);
export const IconEdit = icon(<path d="M4 20h4L19 9l-4-4L4 16v4zM13 7l4 4" />);
export const IconSwap = icon(<path d="M4 8h14M14 4l4 4-4 4M20 16H6M10 12l-4 4 4 4" />);
export const IconSave = icon(<path d="M5 4h11l3 3v13H5zM8 4v5h7V4M8 20v-6h8v6" />);
export const IconPlay = icon(<path d="M7 4.5v15L19.5 12 7 4.5z" />);
export const IconDice = icon(
  <>
    <path d="M4 4h16v16H4z" />
    <path d="M8.5 8.5h.01M15.5 8.5h.01M12 12h.01M8.5 15.5h.01M15.5 15.5h.01" strokeWidth={3} />
  </>,
);
export const IconSun = icon(
  <>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2.5M12 19.5V22M4.2 4.2l1.8 1.8M18 18l1.8 1.8M2 12h2.5M19.5 12H22M4.2 19.8L6 18M18 6l1.8-1.8" />
  </>,
);
export const IconMoon = icon(<path d="M20.5 13.5A8.5 8.5 0 1 1 10.5 3.5a6.5 6.5 0 0 0 10 10z" />);
export const IconWarning = icon(<path d="M12 3l10 18H2L12 3zM12 10v5M12 18v.01" />);
export const IconBolt = icon(<path d="M13 2L4 14h7l-1 8 9-12h-7l1-8z" />);
export const IconSparkle = icon(
  <path d="M12 3l1.8 5.4L19 10l-5.2 1.6L12 17l-1.8-5.4L5 10l5.2-1.6L12 3zM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8L19 16z" />,
);
export const IconBrain = icon(
  <path d="M9 4a3 3 0 0 0-3 3 3 3 0 0 0-2 5 3 3 0 0 0 2 5 3 3 0 0 0 6 1V5a3 3 0 0 0-3-1zM15 4a3 3 0 0 1 3 3 3 3 0 0 1 2 5 3 3 0 0 1-2 5 3 3 0 0 1-6 1" />,
);
export const IconCalc = icon(
  <>
    <path d="M5 3h14v18H5z" />
    <path d="M8 7h8M8 12h.01M12 12h.01M16 12h.01M8 16h.01M12 16h.01M16 16h.01" />
  </>,
);
export const IconMore = icon(<path d="M5 12h.01M12 12h.01M19 12h.01" strokeWidth={3} />);
