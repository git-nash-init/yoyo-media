import type { ReactNode, SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function Svg({ size = 20, children, ...props }: IconProps & { children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      {children}
    </svg>
  );
}

export const HomeIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 10.5 12 3l9 7.5" />
    <path d="M5 9.5V20a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V9.5" />
  </Svg>
);
export const ShortsIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="6" y="2.5" width="12" height="19" rx="3" />
    <path d="m10.5 9 4 3-4 3z" fill="currentColor" />
  </Svg>
);
export const SeriesIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3" y="7" width="18" height="13" rx="2" />
    <path d="M7 3.5h10M5 5.2h14" />
  </Svg>
);
export const ModelsIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21a8 8 0 0 1 16 0" />
  </Svg>
);
export const SubscriptionsIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 20.5s-7.5-4.4-7.5-10A4.3 4.3 0 0 1 12 7.6a4.3 4.3 0 0 1 7.5 2.9c0 5.6-7.5 10-7.5 10z" />
  </Svg>
);
export const SearchIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="11" cy="11" r="7" />
    <path d="m20.5 20.5-4.5-4.500" />
  </Svg>
);
export const ChevronDown = (p: IconProps) => (
  <Svg {...p}>
    <path d="m6 9 6 6 6-6" />
  </Svg>
);
export const ChevronUp = (p: IconProps) => (
  <Svg {...p}>
    <path d="m6 15 6-6 6 6" />
  </Svg>
);
export const ChevronLeft = (p: IconProps) => (
  <Svg {...p}>
    <path d="m15 6-6 6 6 6" />
  </Svg>
);
export const ChevronRight = (p: IconProps) => (
  <Svg {...p}>
    <path d="m9 6 6 6-6 6" />
  </Svg>
);
export const PlayIcon = (p: IconProps) => (
  <Svg {...p} stroke="none" fill="currentColor">
    <path d="M7 4.6v14.8a1 1 0 0 0 1.5.86l12.3-7.4a1 1 0 0 0 0-1.72L8.5 3.74A1 1 0 0 0 7 4.6z" />
  </Svg>
);
export const PauseIcon = (p: IconProps) => (
  <Svg {...p} stroke="none" fill="currentColor">
    <rect x="5.5" y="4" width="4.5" height="16" rx="1.2" />
    <rect x="14" y="4" width="4.5" height="16" rx="1.2" />
  </Svg>
);
export const VolumeIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 9.5v5h3.5L12 18.5v-13L7.500 9.500z" fill="currentColor" />
    <path d="M15.500 9a4.500 4.500 0 0 1 0 6M18 6.500a8 8 0 0 1 0 11" />
  </Svg>
);
export const MutedIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 9.5v5h3.5L12 18.5v-13L7.500 9.500z" fill="currentColor" />
    <path d="m16 9.500 5 5m0-5-5 5" />
  </Svg>
);
export const FullscreenIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
  </Svg>
);
export const ExitFullscreenIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" />
  </Svg>
);
export const DownloadIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 4v11m0 0-4.500-4.500M12 15l4.500-4.500M5 20h14" />
  </Svg>
);
export const CheckIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="m5 12.500 4.500 4.500L19 7.500" />
  </Svg>
);
export const PlusIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 5v14M5 12h14" />
  </Svg>
);
export const UserIcon = ModelsIcon;
export const LockIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="5" y="10.500" width="14" height="10" rx="2" />
    <path d="M8 10.500V7.500a4 4 0 0 1 8 0v3" />
  </Svg>
);
export const WifiOffIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 3l18 18M8.500 16.500a5 5 0 0 1 7 0M5 13a10 10 0 0 1 4-2.500M19 13a10 10 0 0 0-5-2.800M2 9.500a15 15 0 0 1 4.500-3M22 9.500A15 15 0 0 0 11 5.200" />
    <circle cx="12" cy="20" r="1" fill="currentColor" />
  </Svg>
);
export const HeartIcon = ({ filled = false, ...p }: IconProps & { filled?: boolean }) => (
  <Svg {...p} fill={filled ? "currentColor" : "none"}>
    <path d="M12 20.5s-7.5-4.4-7.5-10A4.3 4.3 0 0 1 12 7.6a4.3 4.3 0 0 1 7.5 2.9c0 5.6-7.5 10-7.5 10z" />
  </Svg>
);
export const CommentIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M20 12a8 8 0 0 1-11.8 7L4 20l1.1-4A8 8 0 1 1 20 12z" />
  </Svg>
);
export const ShareIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M13 5.5 20 12l-7 6.5v-4c-4.5 0-7.5 1.2-9.5 4 .6-5 3.500-8.500 9.500-9z" />
  </Svg>
);
export const MenuIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 6.5h16M4 12h16M4 17.5h16" />
  </Svg>
);
export const CloseIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="m6 6 12 12M18 6 6 18" />
  </Svg>
);
export const TrashIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4.500 7h15M9.500 7V4.500h5V7M6.500 7l.8 12a1.500 1.500 0 0 0 1.500 1.400h6.400a1.500 1.500 0 0 0 1.500-1.400l.8-12M10 11v5.500M14 11v5.500" />
  </Svg>
);
export const ShieldIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 3 5 5.800v5.700c0 4.300 2.900 7.700 7 9 4.100-1.300 7-4.700 7-9V5.800z" />
  </Svg>
);
export const SignOutIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M10 4H6a1.500 1.500 0 0 0-1.500 1.500v13A1.500 1.500 0 0 0 6 20h4M15 8l4 4-4 4M19 12H9.500" />
  </Svg>
);
export const SignInIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M14 4h4a1.500 1.500 0 0 1 1.500 1.500v13A1.500 1.500 0 0 1 18 20h-4M10 8l4 4-4 4M14 12H4.500" />
  </Svg>
);
export const StarIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="m12 3.500 2.600 5.400 5.900.800-4.300 4.100 1 5.900L12 16.900l-5.200 2.800 1-5.900-4.300-4.100 5.900-.800z" />
  </Svg>
);
export const EyeIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M2.500 12S6 5.500 12 5.500 21.500 12 21.500 12 18 18.500 12 18.500 2.500 12 2.500 12z" />
    <circle cx="12" cy="12" r="3" />
  </Svg>
);
export const EyeOffIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M10.600 5.700A9.500 9.500 0 0 1 12 5.500c6 0 9.500 6.500 9.500 6.500a15.800 15.800 0 0 1-2.800 3.600M6.600 7.100A15.600 15.600 0 0 0 2.500 12S6 18.500 12 18.500c1.600 0 3-.4 4.300-1M9.900 9.900a3 3 0 0 0 4.200 4.200" />
    <path d="m3.500 3.500 17 17" />
  </Svg>
);
export const BellIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M6 16.500V11a6 6 0 0 1 12 0v5.500l1.500 2h-15L6 16.500z" />
    <path d="M10 21a2 2 0 0 0 4 0" />
  </Svg>
);
export const RotateIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3.500" y="9" width="17" height="10" rx="2" />
    <path d="M8 5.500A6 6 0 0 1 16 5M16 2.500V5.500h-3" />
  </Svg>
);
