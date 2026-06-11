import { useState, type ReactNode, useEffect } from 'react';
import { Snackbar, Alert, Stack, Box, type AlertColor } from '@mui/material';
import { useUiStore, type SnackbarItem } from '../../store/ui.store';

const severityMap: Record<SnackbarItem['severity'], AlertColor> = {
  success: 'success',
  error: 'error',
  warning: 'warning',
  info: 'info',
};

function ToastItem({ item, onDismiss }: { item: SnackbarItem; onDismiss: () => void }): JSX.Element {
  return (
    <Snackbar
      open
      autoHideDuration={item.duration}
      anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
      onClose={(_, reason) => {
        if (reason === 'clickaway') return;
        onDismiss();
      }}
      sx={{ position: 'static', transform: 'none', mb: 1 }}
    >
      <Alert
        severity={severityMap[item.severity]}
        variant="filled"
        onClose={onDismiss}
        sx={{ minWidth: 280, boxShadow: 2 }}
      >
        {item.message}
      </Alert>
    </Snackbar>
  );
}

/**
 * Snackbar stack. Reads queued messages from ui store and renders them as
 * stacked toasts. Pages that want to push messages should call useUiStore().push().
 */
export function ToastStack({ children }: { children: ReactNode }): JSX.Element {
  const items = useUiStore((s) => s.snackbars);
  const dismiss = useUiStore((s) => s.dismiss);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <>
      {children}
      {mounted && (
        <Box
          aria-live="polite"
          aria-atomic="true"
          sx={{
            position: 'fixed',
            top: 16,
            left: 0,
            right: 0,
            zIndex: 2000,
            pointerEvents: 'none',
            display: 'flex',
            justifyContent: 'center',
          }}
        >
          <Stack sx={{ pointerEvents: 'auto', alignItems: 'center', width: '100%' }}>
            {items.map((it) => (
              <ToastItem key={it.id} item={it} onDismiss={() => dismiss(it.id)} />
            ))}
          </Stack>
        </Box>
      )}
    </>
  );
}
