import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Box, Typography, Button, Container } from '@mui/material';

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // eslint-disable-next-line no-console
    console.error('ErrorBoundary caught', error, info);
  }

  reset = (): void => this.setState({ error: null });

  render(): ReactNode {
    if (this.state.error) {
      return (
        <Container maxWidth="sm" sx={{ py: 8 }}>
          <Box sx={{ textAlign: 'center' }}>
            <Typography variant="h4" gutterBottom>⚠️ 出错了</Typography>
            <Typography color="text.secondary" sx={{ mb: 3 }}>
              {this.state.error.message || '未知错误'}
            </Typography>
            <Button variant="contained" onClick={this.reset}>重试</Button>
          </Box>
        </Container>
      );
    }
    return this.props.children;
  }
}
