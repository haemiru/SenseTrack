import { createClient } from '@supabase/supabase-js';

// Supabase 설정값은 .env 파일에서 환경변수로 불러옵니다 (.env.example 참조).
// 기존 jjangasem-bookshop 프로젝트를 공유하므로 모든 테이블에 'sensetrack_' prefix를 붙입니다.
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

const TABLE = 'sensetrack_sessions';

/**
 * 세션 리포트를 Supabase에 저장합니다.
 * report 전체는 jsonb 컬럼에, 조회용 일부 지표는 평탄화된 컬럼에 함께 저장.
 */
export const saveSessionReport = async (reportData) => {
    try {
        // breathingChange는 '+12' 같은 문자열일 수 있어 숫자로 정규화
        const breathingChange = typeof reportData.breathingChange === 'string'
            ? parseInt(reportData.breathingChange, 10) || 0
            : (reportData.breathingChange ?? 0);

        const { error } = await supabase.from(TABLE).insert({
            breathing: reportData.breathing ?? null,
            breathing_status: reportData.breathingStatus ?? null,
            breathing_change: breathingChange,
            duration: reportData.duration ?? null,
            report: reportData,
        });

        if (error) throw error;

        console.log('[Supabase] 세션 리포트 저장 완료');
        return true;
    } catch (e) {
        console.error('[Supabase] 저장 중 오류 발생:', e);
        return false;
    }
};
