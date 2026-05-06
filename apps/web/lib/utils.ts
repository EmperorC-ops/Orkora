import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

export function formatCurrencyMinor(minor: bigint | number, currency: string): string {
  const value = typeof minor === 'bigint' ? Number(minor) / 100 : minor / 100;
  return new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency,
  }).format(value);
}
