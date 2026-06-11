import { Snackbar, Alert, Stack, Box } from '@mui/material';
import { useUiStore, type SnackbarItem } from '../../store/ui.store';

function SnackbarItemView({ item }: { item: SnackbarItem }) {
  const dismiss = useUiStore((s) => s.dismiss);
  return (
    <Snackbar
      open
      autoHideDuration={item.duration}
      anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
      onClose={() => dismiss(item.id)}
    >
      <Alert
        severity={item.severity}
        variant="filled"
        onClose={() => dismiss(item.id)}
        sx={{ minWidth: 280 }}
      >
        {item.message}
      </Alert>
    </Snackbar>
  );
}

export function SnackbarProvider({ children }: { children: React.ReactNode }): JSX.Element {
  const items = useUiStore((s) => s.snackbars);
  return (
    <>
      {children}
      <Stack
        spacing={1}
        sx={{
          position: 'fixed',
          top: 16,
          left: 0,
          right: 0,
          zIndex: 2000,
          pointerEvents: 'none',
          alignItems: 'center',
        }}
      >
        {items.map((it) => (
          <Box key={it.id} sx={{ pointerEvents: 'auto' }}>
            <SnackbarItemView item={it} />
          </Box>
        ))}
      </Stack>
    </>
  );
}
