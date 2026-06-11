import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
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
import PersonIcon from '@mui/icons-material/Person';
import { useAuthStore } from '../store/auth.store';
import { useUiStore } from '../store/ui.store';
import { Input } from '../components/common/Input';
import { Button } from '../components/common/Button';

export function Register(): JSX.Element {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const register = useAuthStore((s) => s.register);
  const loading = useAuthStore((s) => s.loading);
  const push = useUiStore((s) => s.push);
  const [email, setEmail] = useState('');
  const [nickname, setNickname] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const onSubmit = async (e: FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();
    setErr(null);
    if (!email || !password || !nickname) {
      setErr('请完整填写信息');
      return;
    }
    if (password.length < 6) {
      setErr('密码至少 6 位');
      return;
    }
    if (password !== confirm) {
      setErr('两次输入的密码不一致');
      return;
    }
    try {
      await register(email, password, nickname);
      push(t('auth.success'), 'success');
      navigate('/dashboard', { replace: true });
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
            {t('auth.registerTitle')}
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
          label={t('auth.nickname')}
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          required
          fullWidth
          inputProps={{ 'aria-label': t('auth.nickname') }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <PersonIcon fontSize="small" color="action" />
              </InputAdornment>
            ),
          }}
        />

        <Input
          label={`${t('auth.password')} (≥ 6 位)`}
          type={showPwd ? 'text' : 'password'}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="new-password"
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

        <Input
          label="确认密码"
          type={showPwd ? 'text' : 'password'}
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          autoComplete="new-password"
          required
          fullWidth
          inputProps={{ 'aria-label': 'confirm password' }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <LockIcon fontSize="small" color="action" />
              </InputAdornment>
            ),
          }}
        />

        <Button type="submit" variant="contained" size="large" loading={loading} disabled={!email || !password || !nickname}>
          {t('auth.submitRegister')}
        </Button>

        <Divider />

        <Typography variant="body2" color="text.secondary" align="center">
          {t('auth.hasAccount')}{' '}
          <MuiLink component={RouterLink} to="/login" underline="hover">
            {t('nav.login')}
          </MuiLink>
        </Typography>
      </Stack>
    </Box>
  );
}
