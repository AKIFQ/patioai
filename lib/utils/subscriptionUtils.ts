/**
 * Shared utility functions for subscription and usage calculations
 * Can be used in both client and server components
 */

export function calculateUsagePercentage(used: number, limit: number): number {
  if (limit === 0) return 0;
  return Math.min(100, Math.round((used / limit) * 100));
}

export function getUsageStatusColor(percentage: number): string {
  if (percentage >= 90) return 'text-red-500';
  if (percentage >= 75) return 'text-amber-500';
  return 'text-green-500';
}