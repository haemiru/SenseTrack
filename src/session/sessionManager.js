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
            reactionTime: null // null: 평가전, -1: 무반응, >0: 반응시간(초)
        };

        this.activeStimulus = newStimulus;
        this.stimulusLogs.push(newStimulus);
        this.awaitingReaction = true;
        this.baselineAnalysis = null; // 새 자극 적용 시 기준점 초기화

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

            if (timeSinceStimulus < 0.5) {
                // 자극 직후 0.5초 동안의 첫 측정값을 기준점(Baseline)으로 삼아, 
                // 절대값이 아닌 '변화량'을 통해 진짜 반응을 감지하도록 설정
                if (!this.baselineAnalysis) {
                    this.baselineAnalysis = {
                        yaw: analysis.headPose.yaw,
                        pitch: analysis.headPose.pitch,
                        mouthOpen: analysis.mouthOpen,
                        browUp: analysis.browUp,
                        smile: analysis.smile
                    };
                }
                return;
            }

            const base = this.baselineAnalysis;
            if (!base) return;

            // 반응 감지 조건: 자극 적용 당시(기준점)보다 유의미하게 크게 변화했는지 비교
            const moved = Math.abs(analysis.headPose.yaw - base.yaw) > 10 ||
                Math.abs(analysis.headPose.pitch - base.pitch) > 10 ||
                Math.abs(analysis.mouthOpen - base.mouthOpen) > 0.2 ||
                Math.abs(analysis.browUp - base.browUp) > 0.25 ||
                Math.abs(analysis.smile - base.smile) > 0.2;

            if (moved) {
                // 반응 기록
                this.activeStimulus.reactionTime = timeSinceStimulus;
                this.reactionTimes.push({
                    category: this.activeStimulus.category,
                    time: timeSinceStimulus,
                });

                const completed = this.activeStimulus;
                this.awaitingReaction = false;
                this.activeStimulus = null;

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
        const breathingChange = earlyAvg > 0
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
                    totalReactionTime: 0
                };
            }
            stimulusStats[key].count++;
            if (log.reactionTime > 0) {
                stimulusStats[key].reactions++;
                stimulusStats[key].totalReactionTime += log.reactionTime;
            }
        });

        // 통계를 배열로 변환하고 반응률 계산
        const detailStats = Object.values(stimulusStats).map(stat => {
            const avgTime = stat.reactions > 0 ? (stat.totalReactionTime / stat.reactions) : 0;
            // 0.5초 이내 = 100%, 4.5초 이상 = 0% 반응점수 알고리즘
            const score = avgTime > 0 ? Math.round(Math.min(100, Math.max(0, (1 - (avgTime - 0.5) / 4.0) * 100))) : 0;
            return {
                category: stat.category,
                type: stat.type,
                responseRate: score,
                avgReactionTime: avgTime,
                reactionCount: stat.reactions,
                totalCount: stat.count
            };
        });

        // 차트 데이터 포인트 (70개)
        const chartPoints = this.sampleBreathingData(70);

        // 전문가 의견
        let recommendation = '';
        if (metrics.breathing >= 70) {
            recommendation = `현재 호흡 주기가 지난 세션보다 ${Math.abs(breathingChange)}% 더 일정해졌습니다. 꾸준한 훈련을 통해 안정도가 개선되고 있습니다.`;
        } else {
            recommendation = `호흡 패턴에 불규칙한 구간이 감지되었습니다. 더 정밀한 분석을 위해 전문가 화상 상담이나 센터 방문을 권장합니다.`;
        }

        return {
            breathingStatus,
            breathingChange: breathingChange > 0 ? `+${breathingChange}` : breathingChange,
            breathing: metrics.breathing,
            stimulusLogs: this.stimulusLogs, // 타임라인용
            detailStats: detailStats,        // 감각 반응카드용
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
