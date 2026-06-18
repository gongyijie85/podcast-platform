export type UserRole = 'user' | 'admin';

export interface UserDto {
  id: string;
  email: string;
  phone?: string | null;
  nickname: string;
  avatarUrl?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface LoginPayload {
  email: string;
  password: string;
}

export interface RegisterPayload {
  email: string;
  password: string;
  nickname: string;
}

export interface AuthResponse extends UserDto {
  tokens: AuthTokens;
}

export interface UserPreferencesDto {
  recentVoiceIds?: string[];
  recentBgmTrackIds?: string[];
  subtitleStyle?: {
    fontSize: number;
    lineHeight: number;
  };
  language?: 'zh-CN' | 'en-US';
}
