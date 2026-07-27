import { FormEvent, useState } from 'react';

import { supabase } from '../lib/supabase';

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function LoginModal({ isOpen, onClose }: LoginModalProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) {
    return null;
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const normalizedEmail = email.trim();

    if (normalizedEmail.length === 0 || !normalizedEmail.includes('@')) {
      setErrorMessage('올바른 이메일을 입력하세요.');
      return;
    }

    if (password.length < 6) {
      setErrorMessage('비밀번호는 6자 이상이어야 합니다.');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    if (supabase === null) {
      setIsSubmitting(false);
      setErrorMessage('Supabase 환경변수 설정을 확인하세요.');
      return;
    }

    const { error } = await supabase.auth.signInWithPassword({
      email: normalizedEmail,
      password,
    });

    setIsSubmitting(false);

    if (error) {
      setErrorMessage('로그인에 실패했습니다. 이메일과 비밀번호를 확인하세요.');
      return;
    }

    setPassword('');
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-slate-950/50 px-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="login-modal-title"
    >
      <form
        className="w-full max-w-sm rounded-md bg-white p-6 shadow-xl"
        onSubmit={handleSubmit}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="login-modal-title" className="text-lg font-semibold text-slate-950">
              관리자 로그인
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              등록된 관리자 계정으로 로그인하세요.
            </p>
          </div>
          <button
            type="button"
            className="rounded-md px-2 py-1 text-sm text-slate-500 hover:bg-slate-100 hover:text-slate-900"
            onClick={onClose}
            disabled={isSubmitting}
          >
            닫기
          </button>
        </div>

        <label className="mt-5 block text-sm font-medium text-slate-700">
          이메일
          <input
            className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-slate-950 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
            type="email"
            value={email}
            autoComplete="email"
            onChange={(event) => setEmail(event.target.value)}
            disabled={isSubmitting}
            required
          />
        </label>

        <label className="mt-4 block text-sm font-medium text-slate-700">
          비밀번호
          <input
            className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-slate-950 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
            type="password"
            value={password}
            autoComplete="current-password"
            onChange={(event) => setPassword(event.target.value)}
            disabled={isSubmitting}
            required
          />
        </label>

        {errorMessage !== null ? (
          <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {errorMessage}
          </p>
        ) : null}

        <button
          type="submit"
          className="mt-5 w-full rounded-md bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-slate-400"
          disabled={isSubmitting}
        >
          {isSubmitting ? '로그인 중' : '로그인'}
        </button>
      </form>
    </div>
  );
}
