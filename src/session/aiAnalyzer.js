import { GoogleGenerativeAI } from '@google/generative-ai';

/**
 * AI 전문가 분석 모듈 (Gemini 3.1 Pro Preview 사용)
 */
export class AIAnalyzer {
    constructor() {
        const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
        if (!apiKey) {
            console.warn('[AIAnalyzer] VITE_GEMINI_API_KEY is not set. AI analysis will be disabled.');
            this.genAI = null;
            return;
        }
        this.genAI = new GoogleGenerativeAI(apiKey);
    }

    /**
     * 세션 리포트를 바탕으로 AI 전문가 피드백을 생성합니다.
     */
    async generateExpertInsight(sessionReport) {
        if (!this.genAI) {
            return "API 키가 설정되지 않아 전문가 분석을 불러올 수 없습니다.";
        }

        try {
            // 모델 설정: 최신 gemini-3.1-pro-preview 사용
            const model = this.genAI.getGenerativeModel({
                model: 'gemini-3.1-pro-preview',
                // 시스템 지침(System Instructions) 등 필요한 경우 추가 (향후 확장성 고려)
            });

            // 프롬프트 구성
            const prompt = `
당신은 아동 및 성인의 웰니스, 심리, 발달 상태를 분석하는 최고 수준의 전문가입니다.
다음은 방금 완료된 사용자의 애플리케이션(SenseTrack) 비전/음성 센서 측정 세션 결과 데이터입니다.
이 데이터를 바탕으로 현재 사용자의 상태를 분석하고, 실질적으로 도움이 되는 조언(인사이트)을 작성해주세요.
반드시 "사고 모드(Thinking Mode)" 수준의 깊이 있는 전문적인 통찰을 포함하되, 최종 사용자가 읽기 쉽도록 친절하고 따뜻한 어조로 작성해주세요.
글은 무조건 한국어로 작성하며, 너무 길지 않게 핵심 내용 3~4문장 내외로 깔끔하게 정리해주세요.

[세션 데이터]
- 총 진행 시간: ${Math.round(sessionReport.duration)}초
- 평균 호흡/안정성 지수 (0~100): ${sessionReport.breathing}점 (${sessionReport.breathingStatus})
- 이전 대비 안정성 변화: ${sessionReport.breathingChange}%
- 자극에 대한 전체 통계 (시각/청각 등 특정 자극 시 반응 기록):
${sessionReport.detailStats.map(stat => `  * [${stat.category} / ${stat.type}] 반응률 ${stat.responseRate}점, 평균 반응속도 ${stat.avgReactionTime.toFixed(2)}초`).join('\n')}

출력 형식:
마크다운 형식 없이 순수한 텍스트로, 줄바꿈을 적절히 사용하여 읽기 편하게 작성해주세요.
`;

            console.log('[AIAnalyzer] Sending prompt to Gemini...', prompt);

            // AI 호출
            const result = await model.generateContent(prompt);
            const responseText = result.response.text();

            console.log('[AIAnalyzer] Received AI insight:', responseText);
            return responseText;

        } catch (error) {
            console.error('[AIAnalyzer] Error generation expert insight:', error);
            return "데이터 분석 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.";
        }
    }
}
