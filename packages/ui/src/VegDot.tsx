import React from 'react';

export interface VegDotProps {
  veg: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export const VegDot: React.FC<VegDotProps> = ({ veg, size = 'md', className = '' }) => {
  const boxDim = size === 'sm' ? 'w-3.5 h-3.5 p-[1px]' : size === 'lg' ? 'w-5 h-5 p-[2px]' : 'w-4 h-4 p-[1.5px]';
  const symbolDim = size === 'sm' ? 'w-1.5 h-1.5' : size === 'lg' ? 'w-2.5 h-2.5' : 'w-2 h-2';

  const borderColor = veg ? 'border-emerald-600' : 'border-red-600';
  const fillColor = veg ? 'bg-emerald-600' : 'bg-red-600';

  return (
    <div
      role="img"
      aria-label={veg ? 'Vegetarian' : 'Non-Vegetarian'}
      title={veg ? 'Vegetarian' : 'Non-Vegetarian'}
      className={`inline-flex items-center justify-center border-2 rounded-[3px] bg-white ${borderColor} ${boxDim} ${className}`}
    >
      {veg ? (
        <span className={`rounded-full ${fillColor} ${symbolDim}`} />
      ) : (
        <span
          className={`w-0 h-0 border-l-[4px] border-l-transparent border-r-[4px] border-r-transparent border-b-[7px] border-b-red-600`}
        />
      )}
    </div>
  );
};
