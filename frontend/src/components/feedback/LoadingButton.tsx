import { Button, type ButtonProps, CircularProgress } from '@mui/material';

interface Props extends ButtonProps {
  loading?: boolean;
}

export function LoadingButton({ loading, children, disabled, ...rest }: Props): JSX.Element {
  return (
    <Button
      {...rest}
      disabled={disabled || loading}
      startIcon={loading ? <CircularProgress size={16} color="inherit" /> : rest.startIcon}
    >
      {children}
    </Button>
  );
}
