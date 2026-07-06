import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Typography, Button, Container, Paper, Stack } from '@mui/material';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';

interface Props {
  children: ReactNode;
  /** Optional custom fallback renderer */
  fallback?: (error: Error, reset: () => void) => ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Catches uncaught render errors in the subtree and shows a recoverable
 * fallback UI instead of a white screen.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[ErrorBoundary]', error, info);
  }

  reset = (): void => this.setState({ error: null });

  render(): ReactNode {
    const { error } = this.state;
    if (error) {
      if (this.props.fallback) return this.props.fallback(error, this.reset);
      return (
        <Container maxWidth="sm" sx={{ py: { xs: 6, md: 10 } }}>
          <Paper variant="outlined" sx={{ p: { xs: 3, md: 5 } }}>
            <Stack spacing={2} alignItems="center" textAlign="center">
              <ErrorOutlineIcon color="error" sx={{ fontSize: 48 }} aria-hidden />
              <Typography variant="h5" fontWeight={700}>
                出错了
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {error.message || '发生未知错误，请重试。'}
              </Typography>
              <Button variant="contained" onClick={this.reset}>
                重试
              </Button>
            </Stack>
          </Paper>
        </Container>
      );
    }
    return this.props.children;
  }
}
