export const formatDateLT = (date: string | Date | null): string => {
  if (!date) return 'N/A';
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString('lt-LT', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
};

export const formatDateTimeLT = (date: string | Date | null): string => {
  if (!date) return 'N/A';
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleString('lt-LT', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
};

export const formatNumberLT = (num: number | null | undefined): string => {
  if (num === null || num === undefined) return 'N/A';
  return num.toLocaleString('lt-LT', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
};

export const formatCurrencyLT = (amount: number | null | undefined): string => {
  if (amount === null || amount === undefined) return '€0,00';
  return amount.toLocaleString('lt-LT', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

export const toDateInputValue = (date: Date | string | null): string => {
  if (!date) return '';
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toISOString().split('T')[0];
};

export const getDaysUntil = (date: string | Date | null): number | null => {
  if (!date) return null;
  const targetDate = typeof date === 'string' ? new Date(date) : date;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  targetDate.setHours(0, 0, 0, 0);
  const diffTime = targetDate.getTime() - today.getTime();
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
};
