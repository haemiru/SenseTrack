import { createBrowserClient } from '@supabase/ssr';

// Supabase 설정값은 .env 파일에서 환경변수로 불러옵니다 (.env.example 참조).
// 기존 jjangasem-bookshop 프로젝트(auth.users 공유)를 사용하므로
// 모든 테이블에 'sensetrack_' prefix를 붙입니다.
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// 책방(jjangsaem.com)과 로그인 세션을 공유하기 위해, Supabase 세션을
// localStorage가 아니라 '.jjangsaem.com' 범위 쿠키에 저장한다(서브도메인 SSO).
// → 책방에서 네이버/구글/카카오로 로그인하면 센스트랙도 자동 로그인됨.
//   (양쪽 앱이 동일한 방식 = @supabase/ssr createBrowserClient + 같은 쿠키 도메인이어야 함)
// localhost/프리뷰 도메인에서는 도메인을 지정하지 않아 호스트 전용 쿠키로 폴백한다.
function buildCookieOptions() {
    const host = typeof window !== 'undefined' ? window.location.hostname : '';
    const isHttps = typeof window !== 'undefined' && window.location.protocol === 'https:';
    const onBookshopDomain = host === 'jjangsaem.com' || host.endsWith('.jjangsaem.com');

    const base = {
        path: '/',
        sameSite: 'lax',
        maxAge: 60 * 60 * 24 * 365, // 1년
        secure: isHttps,
    };
    return onBookshopDomain
        ? { ...base, domain: '.jjangsaem.com', secure: true }
        : base;
}

export const supabase = createBrowserClient(supabaseUrl, supabaseAnonKey, {
    cookieOptions: buildCookieOptions(),
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
 * 네이버 로그인 — Supabase 네이티브 미지원이라 책방의 네이버 라우트를 직접 호출한다.
 * 책방이 로그인 후 next(=현재 센스트랙 주소)로 복귀시키고, 세션은 .jjangsaem.com
 * 공유 쿠키로 발급되므로 복귀 시 센스트랙이 자동 로그인 상태가 된다.
 */
export const signInWithNaver = () => {
    const next = encodeURIComponent(window.location.href);
    // BOOKSHOP_LOGIN_URL = https://jjangsaem.com/ko/auth → /naver 라우트로
    window.location.href = `${BOOKSHOP_LOGIN_URL}/naver?next=${next}`;
};

/**
 * 책방 로그인 페이지로 이동 (구글/카카오 OAuth 시작 실패 시 폴백).
 * 책방 OAuth 콜백은 외부 리다이렉트를 처리하지 않으므로 next를 넘기지 않는다.
 * (로그인 후 .jjangsaem.com 공유 쿠키로 센스트랙 재방문 시 자동 로그인됨)
 */
export const signInViaBookshop = () => {
    window.location.href = BOOKSHOP_LOGIN_URL;
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
