import { forwardRef, type ReactNode } from 'react';
import { TextField, type TextFieldProps } from '@mui/material';

export interface InputProps extends Omit<TextFieldProps, 'variant'> {
  /** Optional helper text rendered below the field */
  hint?: ReactNode;
  /** Force the outlined variant for consistent appearance */
  variant?: TextFieldProps['variant'];
}

/**
 * Thin wrapper around MUI TextField. The Input is intended for form fields
 * that need predictable layout (label, helper text, error state).
 */
export const Input = forwardRef<HTMLDivElement, InputProps>(function Input(
  { hint, variant = 'outlined', fullWidth = true, ...rest },
  ref,
) {
  return <TextField ref={ref} variant={variant} fullWidth={fullWidth} helperText={hint ?? rest.helperText} {...rest} />;
});
