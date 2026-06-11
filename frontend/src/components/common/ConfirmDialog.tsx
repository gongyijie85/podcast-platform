import { useState, type ReactNode } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  Button,
  CircularProgress,
  type ButtonProps,
} from '@mui/material';

interface Props {
  open: boolean;
  title?: ReactNode;
  message?: ReactNode;
  confirmText?: ReactNode;
  cancelText?: ReactNode;
  confirmColor?: ButtonProps['color'];
  loading?: boolean;
  onConfirm: () => void | Promise<void>;
  onClose: () => void;
}

/**
 * Controlled confirm dialog. Use for destructive or irreversible actions like
 * "Delete project". The `onConfirm` handler is awaited; the close button is
 * disabled while the promise is pending.
 */
export function ConfirmDialog({
  open,
  title = '确认操作',
  message = '此操作不可撤销，是否继续？',
  confirmText = '确认',
  cancelText = '取消',
  confirmColor = 'primary',
  loading = false,
  onConfirm,
  onClose,
}: Props): JSX.Element {
  const [pending, setPending] = useState(false);
  const isBusy = loading || pending;

  const handleConfirm = async (): Promise<void> => {
    setPending(true);
    try {
      await onConfirm();
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={isBusy ? undefined : onClose}
      aria-labelledby="confirm-dialog-title"
      aria-describedby="confirm-dialog-description"
      maxWidth="xs"
      fullWidth
    >
      <DialogTitle id="confirm-dialog-title">{title}</DialogTitle>
      <DialogContent>
        <DialogContentText id="confirm-dialog-description">{message}</DialogContentText>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={isBusy}>
          {cancelText}
        </Button>
        <Button
          onClick={() => void handleConfirm()}
          color={confirmColor}
          variant="contained"
          disabled={isBusy}
          startIcon={isBusy ? <CircularProgress size={14} color="inherit" /> : null}
        >
          {confirmText}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
