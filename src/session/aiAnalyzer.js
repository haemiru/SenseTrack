/**
 * AI 전문가 분석 모듈
 *
 * Claude(Anthropic) API는 브라우저에서 직접 호출하지 않습니다.
 * 키 노출을 막기 위해 Vercel 서버리스 함수(/api/analyze)를 거쳐 호출하며,
 * ANTHROPIC_API_KEY는 Vercel 환경변수(서버 사이드)에만 존재합니다.
 */
export class AIAnalyzer {
    constructor() {
        this.endpoint = '/api/analyze';
    }

    /**
     * 세션 리포트를 바탕으로 AI 전문가 피드백을 생성합니다.
     * 실패 시 throw → 호출부(main.js)에서 기본 추천 문구로 폴백합니다.
     */
    async generateExpertInsight(sessionReport) {
        const res = await fetch(this.endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ report: sessionReport }),
        });

        if (!res.ok) {
            const detail = await res.text().catch(() => '');
            throw new Error(`AI 분석 요청 실패 (${res.status}): ${detail}`);
        }

        const data = await res.json();
        if (!data.insight) {
            throw new Error('AI 응답에 insight가 없습니다.');
        }
        return data.insight;
    }
}
