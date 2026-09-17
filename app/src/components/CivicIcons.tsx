import React from 'react';

interface IconProps extends React.SVGProps<SVGSVGElement> {
  size?: number;
  color?: string;
  strokeWidth?: number;
}

export const IconWaterTap: React.FC<IconProps> = ({ size = 20, color = 'currentColor', strokeWidth = 1.75, ...props }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M4 12h10a4 4 0 0 0 4-4V5" />
    <path d="M15 5h6" />
    <path d="M18 2v6" />
    <path d="M7 12v7" />
    <path d="M5 19h4" />
    <path d="M18 13a2.5 2.5 0 0 1-2.5 2.5c-1.5 0-2.5-1.5-2.5-2.5a2.5 2.5 0 0 1 5 0z" />
  </svg>
);

export const IconStreetlight: React.FC<IconProps> = ({ size = 20, color = 'currentColor', strokeWidth = 1.75, ...props }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M7 21h4" />
    <path d="M9 21V5a2 2 0 0 1 2-2h4a3 3 0 0 1 3 3v2" />
    <path d="M15 8h6l-1 5h-4l-1-5z" />
    <path d="M16 16l-1 2" />
    <path d="M18 16l1 2" />
  </svg>
);

export const IconToilet: React.FC<IconProps> = ({ size = 20, color = 'currentColor', strokeWidth = 1.75, ...props }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M7 4h10v5H7z" />
    <path d="M9 9v3a4 4 0 0 0 6 0V9" />
    <path d="M12 16v5" />
    <path d="M9 21h6" />
  </svg>
);

export const IconRoad: React.FC<IconProps> = ({ size = 20, color = 'currentColor', strokeWidth = 1.75, ...props }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M4 20L8 4" />
    <path d="M20 20L16 4" />
    <path d="M12 4v3" />
    <path d="M12 10v4" />
    <path d="M12 17v3" />
  </svg>
);

export const IconHealth: React.FC<IconProps> = ({ size = 20, color = 'currentColor', strokeWidth = 1.75, ...props }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" {...props}>
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <path d="M12 8v8" />
    <path d="M8 12h8" />
  </svg>
);

export const IconSchool: React.FC<IconProps> = ({ size = 20, color = 'currentColor', strokeWidth = 1.75, ...props }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M2 10l10-6 10 6-10 6L2 10z" />
    <path d="M6 12.5V17c0 2 3 3.5 6 3.5s6-1.5 6-3.5v-4.5" />
    <path d="M22 10v6" />
  </svg>
);

export const IconMap: React.FC<IconProps> = ({ size = 20, color = 'currentColor', strokeWidth = 1.75, ...props }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" {...props}>
    <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" />
    <line x1="8" y1="2" x2="8" y2="18" />
    <line x1="16" y1="6" x2="16" y2="22" />
  </svg>
);

export const IconPlus: React.FC<IconProps> = ({ size = 20, color = 'currentColor', strokeWidth = 1.75, ...props }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" {...props}>
    <line x1="12" y1="5" x2="12" y2="19" />
    <line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);

export const IconClipboard: React.FC<IconProps> = ({ size = 20, color = 'currentColor', strokeWidth = 1.75, ...props }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
    <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
    <line x1="9" y1="12" x2="15" y2="12" />
    <line x1="9" y1="16" x2="13" y2="16" />
  </svg>
);

export const IconRapid: React.FC<IconProps> = ({ size = 20, color = 'currentColor', strokeWidth = 1.75, ...props }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" {...props}>
    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
  </svg>
);

export const IconBarChart: React.FC<IconProps> = ({ size = 20, color = 'currentColor', strokeWidth = 1.75, ...props }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" {...props}>
    <line x1="18" y1="20" x2="18" y2="10" />
    <line x1="12" y1="20" x2="12" y2="4" />
    <line x1="6" y1="20" x2="6" y2="14" />
    <line x1="3" y1="20" x2="21" y2="20" />
  </svg>
);

export const IconSync: React.FC<IconProps> = ({ size = 16, color = 'currentColor', strokeWidth = 1.75, ...props }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M21.5 2v6h-6" />
    <path d="M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.19" />
  </svg>
);

export const IconCheck: React.FC<IconProps> = ({ size = 16, color = 'currentColor', strokeWidth = 2, ...props }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" {...props}>
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

export const IconAlertTriangle: React.FC<IconProps> = ({ size = 18, color = 'currentColor', strokeWidth = 1.75, ...props }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
    <line x1="12" y1="9" x2="12" y2="13" />
    <line x1="12" y1="17" x2="12.01" y2="17" />
  </svg>
);

export const IconSun: React.FC<IconProps> = ({ size = 18, color = 'currentColor', strokeWidth = 1.75, ...props }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" {...props}>
    <circle cx="12" cy="12" r="5" />
    <line x1="12" y1="1" x2="12" y2="3" />
    <line x1="12" y1="21" x2="12" y2="23" />
    <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
    <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
    <line x1="1" y1="12" x2="3" y2="12" />
    <line x1="21" y1="12" x2="23" y2="12" />
    <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
    <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
  </svg>
);

export const IconMoon: React.FC<IconProps> = ({ size = 18, color = 'currentColor', strokeWidth = 1.75, ...props }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
  </svg>
);

export const IconLogout: React.FC<IconProps> = ({ size = 18, color = 'currentColor', strokeWidth = 1.75, ...props }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <polyline points="16 17 21 12 16 7" />
    <line x1="21" y1="12" x2="9" y2="12" />
  </svg>
);

export const IconPrinter: React.FC<IconProps> = ({ size = 18, color = 'currentColor', strokeWidth = 1.75, ...props }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" {...props}>
    <polyline points="6 9 6 2 18 2 18 9" />
    <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
    <rect x="6" y="14" width="12" height="8" />
  </svg>
);

export const IconCamera: React.FC<IconProps> = ({ size = 20, color = 'currentColor', strokeWidth = 1.75, ...props }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
    <circle cx="12" cy="13" r="4" />
  </svg>
);

export const IconCrosshair: React.FC<IconProps> = ({ size = 18, color = 'currentColor', strokeWidth = 1.75, ...props }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" {...props}>
    <circle cx="12" cy="12" r="10" />
    <line x1="22" y1="12" x2="18" y2="12" />
    <line x1="6" y1="12" x2="2" y2="12" />
    <line x1="12" y1="6" x2="12" y2="2" />
    <line x1="12" y1="22" x2="12" y2="18" />
  </svg>
);

export const IconLock: React.FC<IconProps> = ({ size = 16, color = 'currentColor', strokeWidth = 1.75, ...props }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" {...props}>
    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
  </svg>
);

export const IconBuilding: React.FC<IconProps> = ({ size = 20, color = 'currentColor', strokeWidth = 1.75, ...props }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" {...props}>
    <rect x="4" y="2" width="16" height="20" rx="2" />
    <line x1="9" y1="22" x2="9" y2="18" />
    <line x1="15" y1="22" x2="15" y2="18" />
    <line x1="8" y1="6" x2="10" y2="6" />
    <line x1="14" y1="6" x2="16" y2="6" />
    <line x1="8" y1="10" x2="10" y2="10" />
    <line x1="14" y1="10" x2="16" y2="10" />
    <line x1="8" y1="14" x2="10" y2="14" />
    <line x1="14" y1="14" x2="16" y2="14" />
  </svg>
);

export const IconCivicLensLogo: React.FC<IconProps> = ({ size = 24, color = 'currentColor', strokeWidth = 1.75, ...props }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" {...props}>
    <circle cx="12" cy="12" r="9" />
    <circle cx="12" cy="12" r="3" />
    <path d="M12 3v3" />
    <path d="M12 18v3" />
    <path d="M3 12h3" />
    <path d="M18 12h3" />
  </svg>
);

export function getCategoryIcon(categoryId: string, size = 20) {
  switch (categoryId) {
    case 'Water Supply':
      return <IconWaterTap size={size} />;
    case 'Street Lighting':
      return <IconStreetlight size={size} />;
    case 'Public Sanitation':
      return <IconToilet size={size} />;
    case 'Roads & Drains':
      return <IconRoad size={size} />;
    case 'Health (PHC)':
      return <IconHealth size={size} />;
    case 'School / Anganwadi':
      return <IconSchool size={size} />;
    default:
      return <IconBuilding size={size} />;
  }
}

export function getAssetTypeIcon(assetType: string, size = 20) {
  switch (assetType) {
    case 'handpump':
      return <IconWaterTap size={size} />;
    case 'streetlight':
      return <IconStreetlight size={size} />;
    case 'public_toilet':
      return <IconToilet size={size} />;
    case 'drainage':
      return <IconRoad size={size} />;
    case 'anganwadi':
      return <IconBuilding size={size} />;
    case 'school':
      return <IconSchool size={size} />;
    default:
      return <IconBuilding size={size} />;
  }
}export const IconGpsTarget: React.FC<IconProps> = ({ size = 20, color = 'currentColor', strokeWidth = 2, ...props }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" {...props}>
    <circle cx="12" cy="12" r="8" />
    <line x1="12" y1="2" x2="12" y2="6" />
    <line x1="12" y1="18" x2="12" y2="22" />
    <line x1="2" y1="12" x2="6" y2="12" />
    <line x1="18" y1="12" x2="22" y2="12" />
    <circle cx="12" cy="12" r="2" fill={color} />
  </svg>
);
