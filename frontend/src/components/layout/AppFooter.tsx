import { Box, Typography, Container, Stack, Link as MuiLink } from '@mui/material';

export function AppFooter(): JSX.Element {
  return (
    <Box component="footer" sx={{ borderTop: '1px solid #e5e7eb', bgcolor: 'white', py: 2, mt: 4 }}>
      <Container maxWidth="lg">
        <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems="center" spacing={1}>
          <Typography variant="body2" color="text.secondary">
            © {new Date().getFullYear()} Podcast Platform · v1.0
          </Typography>
          <Stack direction="row" spacing={2}>
            <MuiLink href="/docs" variant="body2">文档</MuiLink>
            <MuiLink href="/api-contract" variant="body2">API 契约</MuiLink>
            <Typography variant="body2" color="text.secondary">MIT</Typography>
          </Stack>
        </Stack>
      </Container>
    </Box>
  );
}
