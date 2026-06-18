import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link as RouterLink, useNavigate, useLocation } from 'react-router-dom';
import {
  Box,
  Stack,
  Typography,
  Link as MuiLink,
  Alert,
  Divider,
  InputAdornment,
  IconButton,
} from '@mui/material';
import VisibilityIcon from '@mui/icons-material/Visibility';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import EmailIcon from '@mui/icons-material/Email';
import LockIcon from '@mui/icons-material/Lock';
import { useAuthStore } from '../store/auth.store';
import { useUiStore } from '../store/ui.store';
import { Input } from '../components/common/Input';
import { Button } from '../components/common/Button';
import { isValidEmail, isValidPasswordLength } from '../utils/validation';

export function Login(): JSX.Element {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const login = useAuthStore((s) => s.login);
  const loading = useAuthStore((s) => s.loading);
  const push = useUiStore((s) => s.push);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const from = (location.state as { from?: string } | null)?.from ?? '/dashboard';

  const onSubmit = async (e: FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();
    setErr(null);
    const normalizedEmail = email.trim();
    if (!normalizedEmail || !password) {
      setErr('请填写邮箱和密码');
      return;
    }
    if (!isValidEmail(normalizedEmail)) {
      setErr('请输入有效邮箱地址');
      return;
    }
    if (!isValidPasswordLength(password)) {
      setErr('密码至少 6 位');
      return;
    }
    try {
      await login(normalizedEmail, password);
      push(t('auth.success'), 'success');
      navigate(from, { replace: true });
    } catch (e) {
      const msg = e instanceof Error ? e.message : t('auth.failed');
      setErr(msg);
      push(msg, 'error');
    }
  };

  return (
    <Box component="form" onSubmit={onSubmit} noValidate>
      <Stack spacing={3}>
        <Box>
          <Typography variant="h4" fontWeight={700} gutterBottom>
            {t('auth.loginTitle')}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {t('app.tagline')}
          </Typography>
        </Box>

        {err && <Alert severity="error">{err}</Alert>}

        <Input
          label={t('auth.email')}
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          required
          fullWidth
          inputProps={{ 'aria-label': t('auth.email') }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <EmailIcon fontSize="small" color="action" />
              </InputAdornment>
            ),
          }}
        />

        <Input
          label={t('auth.password')}
          type={showPwd ? 'text' : 'password'}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          required
          fullWidth
          inputProps={{ 'aria-label': t('auth.password') }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <LockIcon fontSize="small" color="action" />
              </InputAdornment>
            ),
            endAdornment: (
              <InputAdornment position="end">
                <IconButton
                  size="small"
                  edge="end"
                  onClick={() => setShowPwd((s) => !s)}
                  aria-label={showPwd ? 'hide password' : 'show password'}
                >
                  {showPwd ? <VisibilityOffIcon fontSize="small" /> : <VisibilityIcon fontSize="small" />}
                </IconButton>
              </InputAdornment>
            ),
          }}
        />

        <Button type="submit" variant="contained" size="large" loading={loading} disabled={!email.trim() || !password}>
          {t('auth.submitLogin')}
        </Button>

        <Divider />

        <Typography variant="body2" color="text.secondary" align="center">
          {t('auth.noAccount')}{' '}
          <MuiLink component={RouterLink} to="/register" underline="hover">
            {t('nav.register')}
          </MuiLink>
        </Typography>
      </Stack>
    </Box>
  );
}
