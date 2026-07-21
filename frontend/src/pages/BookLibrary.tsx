import { useNavigate } from 'react-router-dom';
import { Button, Stack } from '@mui/material';
import QrCodeScannerIcon from '@mui/icons-material/QrCodeScanner';
import { BookOrganizer } from '@/features/book-organizer/BookOrganizer';
import { useTranslation } from 'react-i18next';

/**
 * 选书库页面：复用 BookOrganizer 的 detailMode，
 * 卡片"使用此书"按钮文案变为"查看详情"，点击跳转 /books/:isbn 详情页。
 */
export function BookLibrary(): JSX.Element {
  const navigate = useNavigate();
  const { t } = useTranslation();
  return (
    <Stack spacing={2}>
      <Stack direction="row" justifyContent="flex-end">
        <Button
          variant="contained"
          startIcon={<QrCodeScannerIcon />}
          onClick={() => navigate('/scan')}
        >
          {t('bookLibrary.scan')}
        </Button>
      </Stack>
      <BookOrganizer detailMode onUseBook={(book) => navigate(`/books/${book.isbn}`)} />
    </Stack>
  );
}
