const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const isValidEmail = (email: string): boolean => EMAIL_PATTERN.test(email.trim());

export const isValidPasswordLength = (password: string, minLength = 6): boolean =>
  password.length >= minLength;

export const isValidNicknameLength = (
  nickname: string,
  minLength = 2,
  maxLength = 30,
): boolean => {
  const length = nickname.trim().length;
  return length >= minLength && length <= maxLength;
};

