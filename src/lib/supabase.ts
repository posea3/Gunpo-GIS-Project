import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';

interface ViteImportMetaEnv {
  readonly BASE_URL: string;
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  readonly VITE_VWORLD_API_KEY?: string;
}

declare global {
  interface ImportMeta {
    readonly env: ViteImportMetaEnv;
  }
}

const envSchema = z.object({
  VITE_SUPABASE_URL: z.string().trim().url(),
  VITE_SUPABASE_ANON_KEY: z
    .string()
    .trim()
    .min(1)
    .refine(
      (value) => value.split('.').length === 3 && value.length >= 100,
      'Supabase anon key must be the anon public JWT value.',
    ),
  VITE_VWORLD_API_KEY: z.string().trim().optional(),
});

const viteEnv = import.meta.env;
const parsedEnv = envSchema.safeParse(viteEnv);

export type SupabaseConfigState =
  | { status: 'ready'; message: null }
  | {
      status: 'error';
      message: string;
      fields: string[];
      diagnostics: {
        hasUrl: boolean;
        hasAnonKey: boolean;
        anonKeyLength: number;
        anonKeyLooksLikeJwt: boolean;
      };
    };

const envDiagnostics = {
  hasUrl: typeof viteEnv.VITE_SUPABASE_URL === 'string',
  hasAnonKey: typeof viteEnv.VITE_SUPABASE_ANON_KEY === 'string',
  anonKeyLength: viteEnv.VITE_SUPABASE_ANON_KEY?.trim().length ?? 0,
  anonKeyLooksLikeJwt:
    viteEnv.VITE_SUPABASE_ANON_KEY?.trim().split('.').length === 3,
};

export const supabaseConfigState: SupabaseConfigState = parsedEnv.success
  ? { status: 'ready', message: null }
  : {
    status: 'error',
    message: `Supabase 환경변수 설정을 확인하세요: ${parsedEnv.error.issues
      .map((issue) => {
        const fieldName = issue.path.join('.');
        return issue.message === 'Supabase anon key must be the anon public JWT value.'
          ? `${fieldName}는 Supabase Dashboard의 anon public JWT 값을 입력해야 합니다`
          : fieldName;
      })
      .join(', ')}`,
    fields: parsedEnv.error.issues.map((issue) => issue.path.join('.')),
    diagnostics: envDiagnostics,
  };

export const supabase = parsedEnv.success
  ? createClient(
      parsedEnv.data.VITE_SUPABASE_URL,
      parsedEnv.data.VITE_SUPABASE_ANON_KEY,
    )
  : null;

export const vworldApiKey =
  parsedEnv.success &&
  parsedEnv.data.VITE_VWORLD_API_KEY !== undefined &&
  parsedEnv.data.VITE_VWORLD_API_KEY.length > 0
    ? parsedEnv.data.VITE_VWORLD_API_KEY
    : null;
