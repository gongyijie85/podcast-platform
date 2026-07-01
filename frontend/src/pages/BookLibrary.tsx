import { useNavigate } from 'react-router-dom';
import { BookOrganizer } from '@/features/book-organizer/BookOrganizer';

/**
 * 选书库页面：复用 BookOrganizer 的 detailMode，
 * 卡片"使用此书"按钮文案变为"查看详情"，点击跳转 /books/:isbn 详情页。
 */
export function BookLibrary(): JSX.Element {
  const navigate = useNavigate();
  return (
    <BookOrganizer
      detailMode
      onUseBook={(book) => navigate(`/books/${book.isbn}`)}
    />
  );
}

