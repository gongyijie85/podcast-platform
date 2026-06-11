import { forwardRef, type ReactNode } from 'react';
import { Button as MuiButton, CircularProgress, type ButtonProps } from '@mui/material';

interface Props extends ButtonProps {
  loading?: boolean;
  loadingText?: ReactNode;
  startIcon?: ReactNode;
  endIcon?: ReactNode;
}

/**
 * Wrapper around MUI Button that shows a spinner when `loading` is true
 * and disables interaction. Keeps the original button width to prevent layout shift.
 */
export const Button = forwardRef<HTMLButtonElement, Props>(function Button(
  { loading = false, disabled, children, startIcon, endIcon, loadingText, ...rest },
  ref,
) {
  return (
    <MuiButton
      ref={ref}
      {...rest}
      disabled={disabled || loading}
      startIcon={loading ? <CircularProgress size={16} color="inherit" /> : startIcon}
      endIcon={loading ? null : endIcon}
    >
      {loading && loadingText !== undefined ? loadingText : children}
    </MuiButton>
  );
});
