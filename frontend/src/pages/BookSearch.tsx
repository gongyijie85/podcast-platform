import { useNavigate, useSearchParams } from 'react-router-dom';
import { BookOrganizer } from '../features/book-organizer/BookOrganizer';
import type { BookMetadata } from '@shared/book';

export function BookSearch(): JSX.Element {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initialBookId = searchParams.get('bookId');

  const navigateWithBooks = (books: BookMetadata[]): void => {
    const params = new URLSearchParams();
    for (const book of books) {
      params.append('bookId', book.isbn);
    }
    if (books.length === 1) {
      params.set('title', books[0].title);
      params.set('author', books[0].author);
    }
    navigate(`/projects/new?${params.toString()}`);
  };

  const onUseBook = (book: BookMetadata): void => {
    navigateWithBooks([book]);
  };

  return (
    <BookOrganizer
      initialIsbns={initialBookId ? [initialBookId] : []}
      onUseBook={onUseBook}
      onUseBooks={navigateWithBooks}
    />
  );
}
