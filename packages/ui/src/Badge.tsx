import React from 'react';
import type { SubOrderStatus, OrderStatus } from '@foodcourt/shared';

export interface BadgeProps {
  status: SubOrderStatus | OrderStatus | string;
  className?: string;
}

export const Badge: React.FC<BadgeProps> = ({ status, className = '' }) => {
  let style = 'bg-slate-100 text-slate-700 border-slate-300';
  let label = status;

  switch (status) {
    case 'NEW':
      style = 'bg-blue-50 text-blue-700 border-blue-200 animate-pulse';
      label = 'New Order';
      break;
    case 'ACCEPTED':
      style = 'bg-indigo-50 text-indigo-700 border-indigo-200';
      label = 'Accepted';
      break;
    case 'PREPARING':
      style = 'bg-amber-50 text-amber-700 border-amber-200';
      label = 'Preparing';
      break;
    case 'READY':
      style = 'bg-emerald-50 text-emerald-700 border-emerald-300 shadow-sm font-semibold';
      label = 'Ready for Pickup';
      break;
    case 'COLLECTED':
    case 'COMPLETED':
      style = 'bg-slate-100 text-slate-600 border-slate-200';
      label = 'Collected';
      break;
    case 'REJECTED':
    case 'TIMED_OUT':
    case 'CANCELLED':
    case 'FAILED':
      style = 'bg-rose-50 text-rose-700 border-rose-200';
      label = status.replace('_', ' ');
      break;
    case 'PAID':
      style = 'bg-emerald-50 text-emerald-700 border-emerald-200';
      label = 'Paid';
      break;
    case 'PENDING_PAYMENT':
      style = 'bg-amber-50 text-amber-700 border-amber-200';
      label = 'Payment Pending';
      break;
  }

  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs tracking-wide uppercase border ${style} ${className}`}
    >
      {label}
    </span>
  );
};
