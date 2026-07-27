import { useCallback, useEffect, useRef, useState } from 'react';
import type { Session } from '@supabase/supabase-js';

import { supabase } from '../lib/supabase';

export type AuthRoleState =
  | { status: 'loading'; session: null; isAdmin: false }
  | { status: 'anonymous'; session: null; isAdmin: false }
  | { status: 'authenticated'; session: Session; isAdmin: false }
  | { status: 'admin'; session: Session; isAdmin: true }
  | {
      status: 'error';
      session: Session | null;
      isAdmin: false;
      message: string;
    };

export function useAuthRole() {
  const [authRole, setAuthRole] = useState<AuthRoleState>({
    status: 'loading',
    session: null,
    isAdmin: false,
  });
  const roleRequestSequence = useRef(0);

  useEffect(() => {
    let isActive = true;

    if (supabase === null) {
      setAuthRole({
        status: 'error',
        session: null,
        isAdmin: false,
        message: 'Supabase 환경변수 설정을 확인하세요.',
      });
      return () => {
        isActive = false;
      };
    }

    supabase.auth
      .getSession()
      .then(({ data, error }) => {
        if (!isActive) {
          return;
        }

        if (error) {
          setAuthRole({
            status: 'error',
            session: null,
            isAdmin: false,
            message: '세션을 확인하지 못했습니다.',
          });
          return;
        }

        setAuthRole(
          data.session === null
            ? { status: 'anonymous', session: null, isAdmin: false }
            : {
                status: 'authenticated',
                session: data.session,
                isAdmin: false,
              },
        );
      })
      .catch(() => {
        if (!isActive) {
          return;
        }

        setAuthRole({
          status: 'error',
          session: null,
          isAdmin: false,
          message: '세션을 확인하지 못했습니다.',
        });
      });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setAuthRole(
        session === null
          ? { status: 'anonymous', session: null, isAdmin: false }
          : { status: 'authenticated', session, isAdmin: false },
      );
    });

    return () => {
      isActive = false;
      subscription.unsubscribe();
    };
  }, []);

  const authStatus = authRole.status;
  const session = authRole.session;
  const sessionUserId = session?.user.id;

  useEffect(() => {
    if (authStatus !== 'authenticated' || session === null) {
      roleRequestSequence.current += 1;
      return;
    }

    if (supabase === null) {
      setAuthRole({
        status: 'error',
        session,
        isAdmin: false,
        message: 'Supabase 환경변수 설정을 확인하세요.',
      });
      return;
    }

    const activeSupabase = supabase;
    const requestId = roleRequestSequence.current + 1;
    roleRequestSequence.current = requestId;
    let isActive = true;
    const activeSession = session;

    async function checkAdminRole() {
      try {
        const { data, error } = await activeSupabase.rpc('is_admin');

        if (!isActive || roleRequestSequence.current !== requestId) {
          return;
        }

        if (error || data !== true) {
          setAuthRole({
            status: 'authenticated',
            session: activeSession,
            isAdmin: false,
          });
          return;
        }

        setAuthRole({ status: 'admin', session: activeSession, isAdmin: true });
      } catch {
        if (!isActive || roleRequestSequence.current !== requestId) {
          return;
        }

        setAuthRole({
          status: 'authenticated',
          session: activeSession,
          isAdmin: false,
        });
      }
    }

    void checkAdminRole();

    return () => {
      isActive = false;
    };
  }, [authStatus, session, sessionUserId]);

  const signOut = useCallback(async () => {
    if (supabase === null) {
      setAuthRole({
        status: 'anonymous',
        session: null,
        isAdmin: false,
      });
      return;
    }

    const { error } = await supabase.auth.signOut();

    if (error) {
      setAuthRole((current) => ({
        status: 'error',
        session: current.session,
        isAdmin: false,
        message: '로그아웃하지 못했습니다.',
      }));
      return;
    }

    setAuthRole({ status: 'anonymous', session: null, isAdmin: false });
  }, []);

  return { authRole, signOut };
}
