import { useTranslation } from 'react-i18next';
import { IconButton, Tooltip } from '@mui/material';
import LightModeIcon from '@mui/icons-material/LightMode';
import DarkModeIcon from '@mui/icons-material/DarkMode';
import { useUiStore } from '../../store/ui.store';

export function ThemeToggle(): JSX.Element {
  const { t } = useTranslation();
  const theme = useUiStore((s) => s.theme);
  const toggle = useUiStore((s) => s.toggleTheme);

  return (
    <Tooltip title={theme === 'light' ? t('settings.themeDark') : t('settings.themeLight')}>
      <IconButton
        onClick={toggle}
        size="small"
        aria-label="toggle theme"
        sx={{ ml: 0.5 }}
      >
        {theme === 'light' ? <DarkModeIcon fontSize="small" /> : <LightModeIcon fontSize="small" />}
      </IconButton>
    </Tooltip>
  );
}
