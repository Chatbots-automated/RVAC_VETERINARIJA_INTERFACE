import React from 'react';
import { normalizeNumberInput } from '../lib/helpers';

interface NumberInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type' | 'onChange'> {
  value: string | number;
  onChange: (value: string) => void;
}

export function NumberInput({ value, onChange, ...props }: NumberInputProps) {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const normalized = normalizeNumberInput(e.target.value);
    onChange(normalized);
  };

  return (
    <input
      {...props}
      type="text"
      inputMode="decimal"
      value={value}
      onChange={handleChange}
    />
  );
}
