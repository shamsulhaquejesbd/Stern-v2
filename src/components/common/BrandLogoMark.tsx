import React from 'react';
import { BatteryCharging } from 'lucide-react';
import { SystemBrandingConfig, DEFAULT_SOFTWARE_NAME } from '../../types/systemSettings.ts';

interface BrandLogoMarkProps {
  branding?: Partial<SystemBrandingConfig> | null;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

const SIZE_CLASSES: Record<NonNullable<BrandLogoMarkProps['size']>, { box: string; icon: string }> = {
  xs: { box: 'w-6 h-6 rounded-lg', icon: 'w-3.5 h-3.5' },
  sm: { box: 'w-8 h-8 rounded-xl', icon: 'w-4.5 h-4.5' },
  md: { box: 'w-9 h-9 rounded-xl', icon: 'w-5 h-5' },
  lg: { box: 'w-14 h-14 rounded-2xl', icon: 'w-7 h-7' },
  xl: { box: 'w-20 h-20 rounded-2xl', icon: 'w-9 h-9' },
};

export const BrandLogoMark: React.FC<BrandLogoMarkProps> = ({
  branding,
  size = 'sm',
  className = '',
}) => {
  const { box, icon } = SIZE_CLASSES[size];
  const softwareName = branding?.softwareName?.trim() || DEFAULT_SOFTWARE_NAME;
  const logoUrl = branding?.logoDataUrl?.trim() || null;

  if (logoUrl) {
    return (
      <div
        className={`${box} bg-white dark:bg-slate-800 border border-slate-200/90 dark:border-slate-700 flex items-center justify-center overflow-hidden shadow-xs shrink-0 p-1 ${className}`}
      >
        <img
          src={logoUrl}
          alt={`${softwareName} Logo`}
          className="w-full h-full object-contain"
        />
      </div>
    );
  }

  return (
    <div
      className={`${box} bg-gradient-to-tr from-blue-600 via-indigo-600 to-cyan-500 flex items-center justify-center text-white shadow-xs shrink-0 ${className}`}
    >
      <BatteryCharging className={icon} />
    </div>
  );
};
