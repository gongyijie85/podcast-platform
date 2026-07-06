/**
 * 封面识别返回的候选项（与 BookMetadata 对齐，但 isbn 必填）
 */
export interface CoverRecognizeCandidate {
  isbn: string;
  title: string;
  author: string;
  coverUrl?: string | null;
  summary?: string | null;
  publisher?: string | null;
  publishedDate?: string | null;
  pageCount?: number | null;
}

/**
 * 封面识别结果 DTO
 * - candidates: Google Books 搜索到的候选图书（最多 5 本）
 * - rawRecognition: agnes-2.0-flash 识别到的原始书名+作者（用于调试 / 无候选时提示）
 */
export class CoverRecognizeResultDto {
  candidates!: CoverRecognizeCandidate[];
  rawRecognition!: { title: string; author?: string } | null;
}
