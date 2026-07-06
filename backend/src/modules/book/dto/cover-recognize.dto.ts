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
  titleZh?: string | null;
  authorZh?: string | null;
  publisherZh?: string | null;
  summaryZh?: string | null;
}

/**
 * 原始识别结果（agnes-2.0-flash 从封面图片中读出的信息）
 */
export interface CoverRawRecognition {
  title: string;
  author?: string;
  isbn?: string;
  publisher?: string;
  publishedYear?: string;
  language?: string;
  confidence?: 'high' | 'medium' | 'low' | 'unknown';
}

/**
 * 封面识别结果 DTO
 * - candidates: 搜索到的候选图书（最多 5 本）
 * - rawRecognition: agnes-2.0-flash 识别到的原始信息（用于调试 / 无候选时提示 / 置信度展示）
 */
export class CoverRecognizeResultDto {
  candidates!: CoverRecognizeCandidate[];
  rawRecognition!: CoverRawRecognition | null;
}
