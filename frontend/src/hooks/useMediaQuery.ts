import { useMediaQuery as muiUseMediaQuery } from '@mui/material';

export function useMobile(): boolean {
  return muiUseMediaQuery('(max-width:767px)');
}

export function useTablet(): boolean {
  return muiUseMediaQuery('(min-width:768px) and (max-width:1023px)');
}

export function useDesktop(): boolean {
  return muiUseMediaQuery('(min-width:1024px)');
}
