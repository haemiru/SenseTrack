/**
 * Vercel 서버리스 함수 — Claude(Anthropic) 전문가 분석
 *
 * 프런트엔드(브라우저)는 이 엔드포인트(/api/analyze)만 호출하고,
 * ANTHROPIC_API_KEY는 Vercel 환경변수(서버 사이드)에만 존재해 브라우저에 노출되지 않습니다.
 *
 * 로컬 개발: `vercel dev`로 실행하면 /api 함수가 함께 뜹니다.
 *           (`vite`만 실행하면 /api가 없어 AI 분석은 폴백 문구로 표시됩니다.)
 */
import Anthropic from '@anthropic-ai/sdk';

const MODEL = 'claude-opus-4-7';

const SYSTEM_PROMPT = `당신은 아동 및 성인의 웰니스, 심리, 발달 상태를 분석하는 최고 수준의 전문가입니다.
사용자의 SenseTrack(비전/음성 센서) 측정 세션 결과 데이터를 바탕으로 현재 상태를 분석하고,
실질적으로 도움이 되는 따뜻하고 친절한 조언(인사이트)을 작성합니다.

작성 규칙:
- 반드시 한국어로만 작성합니다.
- 깊이 있는 전문적 통찰을 담되, 최종 사용자가 읽기 쉽도록 핵심 3~4문장 내외로 깔끔하게 정리합니다.
- 마크다운 기호 없이 순수한 텍스트로, 줄바꿈을 적절히 사용해 읽기 편하게 작성합니다.
- 의료적 진단이 아닌 참고용 웰니스 의견임을 전제로 하되, 문장에 "진단" 같은 단정적 표현은 피합니다.`;

function buildUserPrompt(report) {
    const detailStats = Array.isArray(report.detailStats) ? report.detailStats : [];
    const statsText = detailStats.length > 0
        ? detailStats
            .map(s => `  * [${s.category} / ${s.type}] 반응률 ${s.responseRate}점, 평균 반응속도 ${Number(s.avgReactionTime || 0).toFixed(2)}초`)
            .join('\n')
        : '  * (측정된 자극 반응 데이터 없음)';

    return `다음은 방금 완료된 사용자의 측정 세션 결과입니다.

[세션 데이터]
- 총 진행 시간: ${Math.round(report.duration || 0)}초
- 평균 호흡/안정성 지수 (0~100): ${report.breathing}점 (${report.breathingStatus})
- 이전 대비 안정성 변화: ${report.breathingChange}%
- 자극별 반응 통계:
${statsText}

위 데이터를 바탕으로 사용자에게 전할 전문가 인사이트를 작성해주세요.`;
}

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        res.status(405).json({ error: 'Method Not Allowed' });
        return;
    }

    if (!process.env.ANTHROPIC_API_KEY) {
        res.status(500).json({ error: 'ANTHROPIC_API_KEY 환경변수가 설정되지 않았습니다.' });
        return;
    }

    try {
        const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
        const report = body?.report;
        if (!report) {
            res.status(400).json({ error: 'report 데이터가 필요합니다.' });
            return;
        }

        const client = new Anthropic(); // ANTHROPIC_API_KEY 자동 사용

        const message = await client.messages.create({
            model: MODEL,
            max_tokens: 4096,
            thinking: { type: 'adaptive' },
            output_config: { effort: 'medium' },
            system: SYSTEM_PROMPT,
            messages: [{ role: 'user', content: buildUserPrompt(report) }],
        });

        const insight = message.content
            .filter(b => b.type === 'text')
            .map(b => b.text)
            .join('\n')
            .trim();

        if (!insight) {
            res.status(502).json({ error: 'AI가 빈 응답을 반환했습니다.' });
            return;
        }

        res.status(200).json({ insight });
    } catch (err) {
        console.error('[api/analyze] 오류:', err);
        res.status(500).json({ error: '데이터 분석 중 오류가 발생했습니다.' });
    }
}
