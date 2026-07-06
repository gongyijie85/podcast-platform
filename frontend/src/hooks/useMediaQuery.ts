import { useMediaQuery as muiUseMediaQuery } from '@mui/material';

/**
 * 自定义断点与 MUI 默认断点对齐，避免两套体系混用：
 * xs: 0-599, sm: 600-899, md: 900-1199, lg: 1200+
 */

export function useMobile(): boolean {
  return muiUseMediaQuery('(max-width:599px)');
}

export function useTablet(): boolean {
  return muiUseMediaQuery('(min-width:600px) and (max-width:1199px)');
}

export function useDesktop(): boolean {
  return muiUseMediaQuery('(min-width:1200px)');
}

/**
 * 紧凑模式：宽度小于 MUI md 断点（900px）。
 * 用于需要把复杂布局折叠为单栏的场景。
 */
export function useIsCompact(): boolean {
  return muiUseMediaQuery('(max-width:899px)');
}
