import { createClient } from '@supabase/supabase-js';

// Supabase 설정값은 .env 파일에서 환경변수로 불러옵니다 (.env.example 참조).
// 기존 jjangasem-bookshop 프로젝트(auth.users 공유)를 사용하므로
// 모든 테이블에 'sensetrack_' prefix를 붙입니다.
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true, // OAuth 리다이렉트 복귀 시 URL의 토큰을 자동 감지
    },
});

const TABLE = 'sensetrack_sessions';

// 네이버 등 Supabase 네이티브로 지원하지 않는 로그인은 책방 로그인 페이지로 위임합니다.
// (.env의 VITE_BOOKSHOP_LOGIN_URL로 덮어쓸 수 있음)
export const BOOKSHOP_LOGIN_URL =
    import.meta.env.VITE_BOOKSHOP_LOGIN_URL || 'https://jjangsaem.com/ko/auth';

/**
 * 현재 로그인 사용자 반환 (없으면 null)
 */
export const getCurrentUser = async () => {
    const { data } = await supabase.auth.getUser();
    return data?.user ?? null;
};

/**
 * 인증 상태 변화 구독 → 콜백(user|null)
 */
export const onAuthChange = (callback) =>
    supabase.auth.onAuthStateChange((_event, session) => callback(session?.user ?? null));

/**
 * Supabase 네이티브 OAuth 로그인 (google | kakao)
 * 성공 시 공급자 페이지로 리다이렉트되었다가 현재 URL로 복귀합니다.
 */
export const signInWithProvider = async (provider) => {
    return supabase.auth.signInWithOAuth({
        provider,
        options: { redirectTo: window.location.href },
    });
};

/**
 * 네이버 등 책방이 처리하는 로그인으로 이동 (현재 주소를 redirect 파라미터로 전달)
 */
export const signInViaBookshop = () => {
    const back = encodeURIComponent(window.location.href);
    window.location.href = `${BOOKSHOP_LOGIN_URL}?redirect=${back}`;
};

/**
 * 로그아웃
 */
export const signOut = async () => supabase.auth.signOut();

/**
 * 세션 리포트를 Supabase에 저장합니다 (로그인 사용자 본인 행).
 * @returns {Promise<{ok: boolean, reason?: string, error?: any}>}
 */
export const saveSessionReport = async (reportData) => {
    try {
        const { data: userData } = await supabase.auth.getUser();
        const user = userData?.user;
        if (!user) {
            return { ok: false, reason: 'not_authenticated' };
        }

        // breathingChange는 '+12' 같은 문자열일 수 있어 숫자로 정규화
        const breathingChange = typeof reportData.breathingChange === 'string'
            ? parseInt(reportData.breathingChange, 10) || 0
            : (reportData.breathingChange ?? 0);

        const { error } = await supabase.from(TABLE).insert({
            user_id: user.id,
            breathing: reportData.breathing ?? null,
            breathing_status: reportData.breathingStatus ?? null,
            breathing_change: breathingChange,
            duration: reportData.duration ?? null,
            report: reportData,
        });

        if (error) throw error;

        console.log('[Supabase] 세션 리포트 저장 완료');
        return { ok: true };
    } catch (e) {
        console.error('[Supabase] 저장 중 오류 발생:', e);
        return { ok: false, reason: 'error', error: e };
    }
};
