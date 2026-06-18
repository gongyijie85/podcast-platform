import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Login } from '../pages/Login';
import { Register } from '../pages/Register';
import { useAuthStore } from '../store/auth.store';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) =>
      ({
        'auth.email': '邮箱',
        'auth.password': '密码',
        'auth.nickname': '昵称',
        'auth.loginTitle': '登录',
        'auth.registerTitle': '注册',
        'auth.submitLogin': '登录',
        'auth.submitRegister': '注册',
        'auth.noAccount': '没有账号？',
        'auth.hasAccount': '已有账号？',
        'auth.success': '成功',
        'auth.failed': '失败',
        'app.tagline': 'AI 播客制作平台',
        'nav.register': '注册',
        'nav.login': '登录',
      })[key] ?? key,
  }),
}));

describe('auth pages validation', () => {
  beforeEach(() => {
    useAuthStore.setState({
      loading: false,
      error: null,
      login: vi.fn().mockResolvedValue(undefined),
      register: vi.fn().mockResolvedValue(undefined),
    });
  });

  it('blocks login with invalid email before calling login', async () => {
    const login = vi.fn().mockResolvedValue(undefined);
    useAuthStore.setState({ login });
    render(<Login />, { wrapper: MemoryRouter });

    fireEvent.change(screen.getByLabelText('邮箱'), { target: { value: 'not-email' } });
    fireEvent.change(screen.getByLabelText('密码'), { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: '登录' }));

    expect(await screen.findByText('请输入有效邮箱地址')).toBeInTheDocument();
    expect(login).not.toHaveBeenCalled();
  });

  it('blocks login with short password before calling login', async () => {
    const login = vi.fn().mockResolvedValue(undefined);
    useAuthStore.setState({ login });
    render(<Login />, { wrapper: MemoryRouter });

    fireEvent.change(screen.getByLabelText('邮箱'), { target: { value: 'user@example.com' } });
    fireEvent.change(screen.getByLabelText('密码'), { target: { value: '12345' } });
    fireEvent.click(screen.getByRole('button', { name: '登录' }));

    expect(await screen.findByText('密码至少 6 位')).toBeInTheDocument();
    expect(login).not.toHaveBeenCalled();
  });

  it('submits login with trimmed email', async () => {
    const login = vi.fn().mockResolvedValue(undefined);
    useAuthStore.setState({ login });
    render(<Login />, { wrapper: MemoryRouter });

    fireEvent.change(screen.getByLabelText('邮箱'), { target: { value: ' user@example.com ' } });
    fireEvent.change(screen.getByLabelText('密码'), { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: '登录' }));

    await waitFor(() => expect(login).toHaveBeenCalledWith('user@example.com', '123456'));
  });

  it('blocks register with invalid nickname before calling register', async () => {
    const register = vi.fn().mockResolvedValue(undefined);
    useAuthStore.setState({ register });
    render(<Register />, { wrapper: MemoryRouter });

    fireEvent.change(screen.getByLabelText('邮箱'), { target: { value: 'user@example.com' } });
    fireEvent.change(screen.getByLabelText('昵称'), { target: { value: 'a' } });
    fireEvent.change(screen.getByLabelText('密码'), { target: { value: '123456' } });
    fireEvent.change(screen.getByLabelText('confirm password'), { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: '注册' }));

    expect(await screen.findByText('昵称长度需为 2-30 个字符')).toBeInTheDocument();
    expect(register).not.toHaveBeenCalled();
  });

  it('blocks register with mismatched password before calling register', async () => {
    const register = vi.fn().mockResolvedValue(undefined);
    useAuthStore.setState({ register });
    render(<Register />, { wrapper: MemoryRouter });

    fireEvent.change(screen.getByLabelText('邮箱'), { target: { value: 'user@example.com' } });
    fireEvent.change(screen.getByLabelText('昵称'), { target: { value: 'Tester' } });
    fireEvent.change(screen.getByLabelText('密码'), { target: { value: '123456' } });
    fireEvent.change(screen.getByLabelText('confirm password'), { target: { value: '654321' } });
    fireEvent.click(screen.getByRole('button', { name: '注册' }));

    expect(await screen.findByText('两次输入的密码不一致')).toBeInTheDocument();
    expect(register).not.toHaveBeenCalled();
  });

  it('submits register with trimmed email and nickname', async () => {
    const register = vi.fn().mockResolvedValue(undefined);
    useAuthStore.setState({ register });
    render(<Register />, { wrapper: MemoryRouter });

    fireEvent.change(screen.getByLabelText('邮箱'), { target: { value: ' user@example.com ' } });
    fireEvent.change(screen.getByLabelText('昵称'), { target: { value: ' Tester ' } });
    fireEvent.change(screen.getByLabelText('密码'), { target: { value: '123456' } });
    fireEvent.change(screen.getByLabelText('confirm password'), { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: '注册' }));

    await waitFor(() => expect(register).toHaveBeenCalledWith('user@example.com', '123456', 'Tester'));
  });
});

