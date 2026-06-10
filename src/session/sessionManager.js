/**
 * SenseTrack — Session Manager
 * 
 * 세션 상태, 타이머, 자극 제어, 데이터 수집을 관리.
 * 모든 센서 데이터를 수집하여 세션 리포트를 생성.
 */

export class SessionManager {
    constructor() {
        this.isActive = false;
        this.startTime = 0;
        this.elapsed = 0;
        this.timerInterval = null;

        // 자극 상태
        this.activeStimulus = null; // { id, category, type, startTime, reactionTime }
        this.stimulusLogs = [];     // 전체 자극 제공 기록

        // 수집 데이터
        this.breathingData = [];     // 호흡 안정도 시계열
        this.reactionTimes = [];     // 반응 시간 (최근 지표용)
        this.headPoseHistory = [];   // 고개 움직임 이력
        this.voiceData = [];         // 발성 데이터

        // 반응 측정
        this.awaitingReaction = false;
        this.baselineAnalysis = null;
        this.reactionProgress = 0; // 추적 중 움직임 진행도(0~1+), UI 피드백용

        // 콜백
        this._onTimerUpdate = null;
        this._onSessionEnd = null;
        this._onReactionDetected = null;
    }

    /**
     * 세션 시작
     */
    start() {
        this.isActive = true;
        this.startTime = performance.now();
        this.elapsed = 0;
        this.Reset();

        this.timerInterval = setInterval(() => {
            this.elapsed = (performance.now() - this.startTime) / 1000;
            if (this._onTimerUpdate) {
                const mins = Math.floor(this.elapsed / 60);
                const secs = Math.floor(this.elapsed % 60);
                this._onTimerUpdate(
                    String(mins).padStart(2, '0'),
                    String(secs).padStart(2, '0')
                );
            }
        }, 250);

        console.log('[SessionManager] Session started');
    }

    /**
     * 수집 데이터 초기화
     */
    Reset() {
        this.breathingData = [];
        this.reactionTimes = [];
        this.headPoseHistory = [];
        this.voiceData = [];
        this.stimulusLogs = [];
        this.activeStimulus = null;
        this.awaitingReaction = false;
        this.baselineAnalysis = null;
        this.reactionProgress = 0;
    }

    /**
     * 자극 활성화 (기록 시작)
     */
    activateStimulus(category, type) {
        if (this.awaitingReaction) return null; // 이미 추적 중

        const newStimulus = {
            id: Date.now(),
            category: category,
            type: type,
            startTime: performance.now(),
            displayTime: this.elapsed,
            reactionTime: null, // null: 평가전, -1: 무반응, >0: 반응시간(초)
            reactionKind: null, // 반응 종류 코드: head_yaw/head_pitch/mouth/brow/smile
            reactionLabel: null // 반응 종류 한글: 고개 좌우/고개 끄덕임/입 벌림/눈썹/미소
        };

        this.activeStimulus = newStimulus;
        this.stimulusLogs.push(newStimulus);
        this.awaitingReaction = true;
        this.baselineAnalysis = null; // 새 자극 적용 시 기준점 초기화
        this.reactionProgress = 0;

        console.log(`[SessionManager] Stimulus activated: ${category} - ${type}`);
        return newStimulus;
    }

    /**
     * 무반응 처리 (건너뛰기)
     */
    skipReaction() {
        if (!this.awaitingReaction || !this.activeStimulus) return null;

        this.activeStimulus.reactionTime = -1; // 무반응 플래그
        const completedStimulus = this.activeStimulus;

        this.awaitingReaction = false;
        this.activeStimulus = null;
        this.reactionProgress = 0;

        return completedStimulus;
    }

    /**
     * 얼굴 분석 데이터 기록
     */
    recordFaceData(analysis) {
        if (!this.isActive || !analysis) return;

        // 호흡 안정도 (입 움직임 + 깜빡임 패턴 기반 간이 추정)
        const mouthActivity = analysis.mouthOpen;
        const eyeActivity = (analysis.leftEyeBlink + analysis.rightEyeBlink) / 2;
        // 호흡 안정도: 입 움직임이 적고, 눈 깜빡임이 일정할수록 안정
        const breathingStability = Math.max(0, Math.min(100,
            100 - (mouthActivity * 80) - (Math.abs(eyeActivity - 0.15) * 40)
        ));

        this.breathingData.push({
            time: this.elapsed,
            value: breathingStability,
        });

        // 고개 움직임
        this.headPoseHistory.push({
            time: this.elapsed,
            yaw: analysis.headPose.yaw,
            pitch: analysis.headPose.pitch,
            direction: analysis.headPose.direction,
        });

        // 자극 반응 감지
        if (this.awaitingReaction && this.activeStimulus && analysis.headPose) {
            // 쿨타임 (자극 적용 직후 0.5초간은 반응 무시 - 오작동 방지)
            const timeSinceStimulus = (performance.now() - this.activeStimulus.startTime) / 1000;

            const snapshot = {
                yaw: analysis.headPose.yaw,
                pitch: analysis.headPose.pitch,
                mouthOpen: analysis.mouthOpen,
                browUp: analysis.browUp,
                smile: analysis.smile,
            };

            if (timeSinceStimulus < 0.5) {
                // 쿨타임 동안 매 프레임 기준점을 갱신 → 쿨타임 종료 직전 값이 기준점이 됨
                // (절대값이 아닌 '변화량'으로 진짜 반응을 감지하기 위함)
                this.baselineAnalysis = snapshot;
                return;
            }

            // 쿨타임 중 프레임이 한 번도 없었던 경우(느린 CPU 등): 첫 프레임을 기준점으로 잡고
            // 다음 프레임부터 비교 → baseline이 영영 null로 남아 감지가 막히는 문제 방지
            if (!this.baselineAnalysis) {
                this.baselineAnalysis = snapshot;
                return;
            }

            const base = this.baselineAnalysis;

            // 변화량 계산
            const dYaw = Math.abs(snapshot.yaw - base.yaw);
            const dPitch = Math.abs(snapshot.pitch - base.pitch);
            const dMouth = Math.abs(snapshot.mouthOpen - base.mouthOpen);
            const dBrow = Math.abs(snapshot.browUp - base.browUp);
            const dSmile = Math.abs(snapshot.smile - base.smile);

            // 임계값 (느린 프레임레이트 + 스무딩을 고려해 다소 낮춤)
            const TH = { yaw: 7, pitch: 7, mouth: 0.18, brow: 0.22, smile: 0.18 };

            // 진행도(0~1+): 임계 대비 가장 큰 변화량 — 실시간 UI 피드백용
            this.reactionProgress = Math.max(
                dYaw / TH.yaw, dPitch / TH.pitch,
                dMouth / TH.mouth, dBrow / TH.brow, dSmile / TH.smile
            );

            const moved = dYaw > TH.yaw || dPitch > TH.pitch ||
                dMouth > TH.mouth || dBrow > TH.brow || dSmile > TH.smile;

            if (moved) {
                // 어떤 반응이 가장 강했는지(임계 대비 비율 최대) 판별 → 반응 종류로 기록
                const candidates = [
                    { kind: 'head_yaw', label: '고개 좌우', r: dYaw / TH.yaw },
                    { kind: 'head_pitch', label: '고개 끄덕임', r: dPitch / TH.pitch },
                    { kind: 'mouth', label: '입 벌림', r: dMouth / TH.mouth },
                    { kind: 'brow', label: '눈썹 움직임', r: dBrow / TH.brow },
                    { kind: 'smile', label: '미소', r: dSmile / TH.smile },
                ];
                candidates.sort((a, b) => b.r - a.r);
                const dominant = candidates[0];

                // 반응 기록
                this.activeStimulus.reactionTime = timeSinceStimulus;
                this.activeStimulus.reactionKind = dominant.kind;
                this.activeStimulus.reactionLabel = dominant.label;
                this.reactionTimes.push({
                    category: this.activeStimulus.category,
                    time: timeSinceStimulus,
                    kind: dominant.kind,
                    label: dominant.label,
                });

                const completed = this.activeStimulus;
                this.awaitingReaction = false;
                this.activeStimulus = null;
                this.reactionProgress = 0;

                if (this._onReactionDetected) {
                    this._onReactionDetected(completed);
                }
            }
        }
    }

    /**
     * 오디오 데이터 기록
     */
    recordAudioData(audioResult) {
        if (!this.isActive) return;

        this.voiceData.push({
            time: this.elapsed,
            db: audioResult.db,
            isVoicing: audioResult.isVoicing,
            duration: audioResult.voiceDuration,
            maxDuration: audioResult.maxDuration,
        });
    }

    /**
     * 현재 실시간 지표 가져오기
     */
    getCurrentMetrics() {
        const recentBreathing = this.breathingData.slice(-30);
        const avgBreathing = recentBreathing.length > 0
            ? recentBreathing.reduce((s, d) => s + d.value, 0) / recentBreathing.length
            : 0;

        const lastReaction = this.reactionTimes.length > 0
            ? this.reactionTimes[this.reactionTimes.length - 1].time
            : null;

        const avgReaction = this.reactionTimes.length > 0
            ? this.reactionTimes.reduce((s, d) => s + d.time, 0) / this.reactionTimes.length
            : null;

        const lastHead = this.headPoseHistory.length > 0
            ? this.headPoseHistory[this.headPoseHistory.length - 1]
            : null;

        const lastVoice = this.voiceData.length > 0
            ? this.voiceData[this.voiceData.length - 1]
            : null;

        return {
            breathing: Math.round(avgBreathing),
            reactionTime: lastReaction ? Math.round(lastReaction * 10) / 10 : null,
            avgReactionTime: avgReaction ? Math.round(avgReaction * 10) / 10 : null,
            headPose: lastHead,
            voiceDuration: lastVoice?.duration || 0,
            maxVoiceDuration: lastVoice?.maxDuration || 0,
        };
    }

    /**
     * 세션 리포트 생성
     */
    generateReport() {
        const metrics = this.getCurrentMetrics();

        // 호흡 안정도 추이
        const third = Math.floor(this.breathingData.length / 3);
        const earlyBreathing = this.breathingData.slice(0, third);
        const lateBreathing = this.breathingData.slice(-third);
        const earlyAvg = earlyBreathing.length > 0
            ? earlyBreathing.reduce((s, d) => s + d.value, 0) / earlyBreathing.length : 0;
        const lateAvg = lateBreathing.length > 0
            ? lateBreathing.reduce((s, d) => s + d.value, 0) / lateBreathing.length : 0;
        // 세션 내 변화: 세션 초반 1/3 대비 후반 1/3의 호흡 안정도 변화율
        // (이전 '세션 간' 비교는 main.js에서 localStorage의 직전 세션과 비교해 덮어쓴다)
        const sessionTrendChange = earlyAvg > 0
            ? Math.round(((lateAvg - earlyAvg) / earlyAvg) * 100) : 0;

        // 호흡 상태
        let breathingStatus = '분석 중';
        if (metrics.breathing >= 80) breathingStatus = '매우 안정';
        else if (metrics.breathing >= 60) breathingStatus = '안정';
        else if (metrics.breathing >= 40) breathingStatus = '보통';
        else breathingStatus = '불안정';

        // 자극별 세부 통계 (동적)
        const stimulusStats = {};
        this.stimulusLogs.forEach(log => {
            const key = `${log.category}_${log.type}`;
            if (!stimulusStats[key]) {
                stimulusStats[key] = {
                    category: log.category,
                    type: log.type,
                    count: 0,
                    reactions: 0,
                    totalReactionTime: 0,
                    kinds: {} // 반응 종류별 횟수 (예: { '고개 좌우': 2, '미소': 1 })
                };
            }
            stimulusStats[key].count++;
            if (log.reactionTime > 0) {
                stimulusStats[key].reactions++;
                stimulusStats[key].totalReactionTime += log.reactionTime;
                const lbl = log.reactionLabel || '기타';
                stimulusStats[key].kinds[lbl] = (stimulusStats[key].kinds[lbl] || 0) + 1;
            }
        });

        // 통계를 배열로 변환
        const detailStats = Object.values(stimulusStats).map(stat => {
            const avgTime = stat.reactions > 0 ? (stat.totalReactionTime / stat.reactions) : 0;

            // 반응률 = 제시 횟수 중 실제 반응한 비율 (직관적: "N회 중 M회 반응")
            const responseRate = stat.count > 0
                ? Math.round((stat.reactions / stat.count) * 100) : 0;

            // 반응 속도 라벨 (반응이 있었을 때만)
            let speedLabel = null;
            if (stat.reactions > 0) {
                if (avgTime <= 1.0) speedLabel = '빠름';
                else if (avgTime <= 2.5) speedLabel = '보통';
                else speedLabel = '느림';
            }

            // 반응 종류 요약 (많은 순)
            const reactionKinds = Object.entries(stat.kinds)
                .sort((a, b) => b[1] - a[1])
                .map(([kind, count]) => ({ kind, count }));

            return {
                category: stat.category,
                type: stat.type,
                responseRate,                         // 반응 비율(%)
                avgReactionTime: avgTime,             // 평균 반응속도(초)
                speedLabel,                           // 빠름/보통/느림
                reactionCount: stat.reactions,
                totalCount: stat.count,
                reactionKinds,                        // [{kind:'고개 좌우', count:2}, ...]
                topKind: reactionKinds.length ? reactionKinds[0].kind : null,
            };
        });

        // 차트 데이터 포인트 (70개)
        const chartPoints = this.sampleBreathingData(70);

        // 전문가 의견 (AI 호출 실패 시 폴백 — 사실과 맞지 않는 '지난 세션' 단정 표현 제거)
        let recommendation = '';
        if (metrics.breathing >= 70) {
            recommendation = `측정된 호흡 안정도가 양호한 편입니다. 꾸준한 훈련으로 현재의 안정도를 유지·개선해 보세요.`;
        } else {
            recommendation = `호흡 패턴에 불규칙한 구간이 감지되었습니다. 더 정밀한 분석을 위해 전문가 화상 상담이나 센터 방문을 권장합니다.`;
        }

        return {
            breathingStatus,
            breathing: metrics.breathing,
            // 기본값: 세션 내 변화 (이전 세션 기록이 있으면 main.js가 '이전 세션 대비'로 덮어씀)
            breathingChange: sessionTrendChange,
            sessionTrendChange,
            comparisonBasis: 'session',          // 'session' | 'previous'
            comparisonLabel: '세션 내 변화',
            stimulusLogs: this.stimulusLogs,     // 타임라인용
            detailStats: detailStats,            // 감각 반응카드용
            chartPoints,
            recommendation,
            duration: this.elapsed,
        };
    }

    /**
     * 호흡 데이터를 차트용으로 샘플링
     */
    sampleBreathingData(numPoints) {
        if (this.breathingData.length <= numPoints) {
            return this.breathingData.map(d => d.value);
        }

        const result = [];
        const step = this.breathingData.length / numPoints;
        for (let i = 0; i < numPoints; i++) {
            const idx = Math.floor(i * step);
            result.push(this.breathingData[idx].value);
        }
        return result;
    }

    /**
     * 세션 종료
     */
    end() {
        this.isActive = false;
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
            this.timerInterval = null;
        }

        const report = this.generateReport();
        if (this._onSessionEnd) {
            this._onSessionEnd(report);
        }

        console.log('[SessionManager] Session ended, report generated');
        return report;
    }

    /**
     * 타이머 업데이트 콜백
     */
    onTimerUpdate(callback) {
        this._onTimerUpdate = callback;
    }

    /**
     * 세션 종료 콜백
     */
    onSessionEnd(callback) {
        this._onSessionEnd = callback;
    }

    /**
     * 반응 감지 콜백
     */
    onReactionDetected(callback) {
        this._onReactionDetected = callback;
    }
}
