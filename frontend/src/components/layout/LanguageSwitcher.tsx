import { useState, type MouseEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { IconButton, Menu, MenuItem, ListItemIcon, ListItemText, Tooltip } from '@mui/material';
import LanguageIcon from '@mui/icons-material/Language';
import { useUiStore, type Language } from '../../store/ui.store';
import i18n from '../../i18n';

const LANGS: Array<{ code: Language; label: string; short: string }> = [
  { code: 'zh-CN', label: '中文', short: '中' },
  { code: 'en-US', label: 'English', short: 'EN' },
];

export function LanguageSwitcher(): JSX.Element {
  const { t } = useTranslation();
  const language = useUiStore((s) => s.language);
  const setLanguage = useUiStore((s) => s.setLanguage);
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);

  const open = (e: MouseEvent<HTMLElement>): void => setAnchor(e.currentTarget);
  const close = (): void => setAnchor(null);

  const select = async (code: Language): Promise<void> => {
    close();
    setLanguage(code);
    await i18n.changeLanguage(code);
  };

  return (
    <>
      <Tooltip title={t('settings.language')}>
        <IconButton
          onClick={open}
          size="small"
          aria-label="switch language"
          sx={{ ml: 0.5 }}
        >
          <LanguageIcon fontSize="small" />
        </IconButton>
      </Tooltip>
      <Menu anchorEl={anchor} open={Boolean(anchor)} onClose={close} keepMounted>
        {LANGS.map((l) => (
          <MenuItem
            key={l.code}
            selected={l.code === language}
            onClick={() => void select(l.code)}
          >
            <ListItemIcon sx={{ minWidth: 32 }}>
              <span style={{ fontSize: 12, fontWeight: 600 }}>{l.short}</span>
            </ListItemIcon>
            <ListItemText primary={l.label} />
          </MenuItem>
        ))}
      </Menu>
    </>
  );
}
