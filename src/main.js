/**
 * SenseTrack — Main Application
 * 
 * 모든 모듈을 연결하고 UI 상호작용을 관리하는 진입점.
 * - MediaPipe Face Landmarker (얼굴 메쉬 + 블렌드쉐이프)
 * - Web Audio API (dB, 발성 감지)
 * - Session Manager (데이터 수집, 리포트)
 */

import { FaceTracker } from './mediapipe/faceTracker.js';
import { AudioAnalyzer } from './mediapipe/audioAnalyzer.js';
import { SessionManager } from './session/sessionManager.js';
import Chart from 'chart.js/auto';
import { saveSessionReport } from './firebase.js';
import { AIAnalyzer } from './session/aiAnalyzer.js';

class SenseTrackApp {
    constructor() {
        // 모듈
        this.faceTracker = new FaceTracker();
        this.audioAnalyzer = new AudioAnalyzer();
        this.sessionManager = new SessionManager();
        this.aiAnalyzer = new AIAnalyzer();

        // 카메라
        this.cameraStream = null;
        this.isCameraActive = false;
        this.animationFrameId = null;

        // 차트 인스턴스
        this.chartInstance = null;
        this.currentReportData = null;

        // DOM 참조
        this.dom = {};

        // 초기화
        this.init();
    }

    /**
     * 앱 초기화
     */
    async init() {
        this.cacheDom();
        this.bindEvents();
        this.updateStatus('준비 중', false);

        // MediaPipe 사전 로드
        this.updateStatus('AI 모델 로딩 중...', false);
        const faceReady = await this.faceTracker.initialize();

        if (faceReady) {
            this.updateStatus('카메라 대기 중', false);
        } else {
            this.updateStatus('모델 로딩 실패', false);
        }
    }

    /**
     * DOM 요소 캐싱
     */
    cacheDom() {
        this.dom = {
            // Camera
            video: document.getElementById('cameraFeed'),
            canvas: document.getElementById('faceMeshCanvas'),
            cameraViewport: document.getElementById('cameraViewport'),
            cameraToggle: document.getElementById('cameraToggle'),
            cameraToggleIcon: document.getElementById('cameraToggleIcon'),
            faceMeshOverlay: document.getElementById('faceMeshOverlay'),
            liveBadge: document.getElementById('liveBadge'),

            // dB
            dbOverlay: document.getElementById('dbOverlay'),
            dbValue: document.getElementById('dbValue'),
            dbBars: document.querySelectorAll('.db-bar'),

            // Status
            statusBadge: document.getElementById('statusBadge'),
            statusText: document.querySelector('.status-text'),

            // Timer
            timerSegments: document.querySelectorAll('.timer-segment'),

            // Stimulus UI
            tabOlfactory: document.getElementById('tabOlfactory'),
            tabAuditory: document.getElementById('tabAuditory'),
            olfactoryOptions: document.getElementById('olfactoryOptions'),
            auditoryOptions: document.getElementById('auditoryOptions'),
            stimChips: document.querySelectorAll('.stim-chip'),
            stimApplyBtn: document.getElementById('stimApplyBtn'),
            stimApplyIcon: document.getElementById('stimApplyIcon'),
            stimApplyText: document.getElementById('stimApplyText'),
            reactionTracker: document.getElementById('reactionTracker'),
            reactionTrackerTime: document.getElementById('reactionTrackerTime'),
            reactionSkipBtn: document.getElementById('reactionSkipBtn'),
            logSection: document.getElementById('logSection'),
            stimLog: document.getElementById('stimLog'),
            logCount: document.getElementById('logCount'),

            // Metrics
            breathingValue: document.getElementById('breathingValue'),
            breathingBar: document.getElementById('breathingBar'),
            reactionValue: document.getElementById('reactionValue'),
            reactionSub: document.getElementById('reactionSub'),
            headValue: document.getElementById('headValue'),
            headSub: document.getElementById('headSub'),
            voiceValue: document.getElementById('voiceValue'),
            voiceSub: document.getElementById('voiceSub'),

            // Footer
            endSessionBtn: document.getElementById('endSessionBtn'),

            // Report
            reportOverlay: document.getElementById('reportOverlay'),
            reportClose: document.getElementById('reportClose'),
            reportSave: document.getElementById('reportSave'),
            reportBreathingStatus: document.getElementById('reportBreathingStatus'),
            reportBreathingPct: document.getElementById('reportBreathingPct'),
            reportChartCanvas: document.getElementById('reportChartCanvas'),
            reportResponseCards: document.getElementById('reportResponseCards'),
            reportTimeline: document.getElementById('reportTimeline'),
            reportRecommendation: document.getElementById('reportRecommendation'),
            bookingBtn: document.getElementById('bookingBtn'),
        };
    }

    /**
     * 이벤트 바인딩
     */
    bindEvents() {
        // 카메라 토글
        this.dom.cameraToggle.addEventListener('click', () => this.toggleCamera());

        // 자극 탭 전환
        this.dom.tabOlfactory.addEventListener('click', () => this.switchStimTab('olfactory'));
        this.dom.tabAuditory.addEventListener('click', () => this.switchStimTab('auditory'));

        // 자극 칩 선택
        this.dom.stimChips.forEach(chip => {
            chip.addEventListener('click', (e) => this.selectStimChip(e.currentTarget));
        });

        // 자극 적용 버튼
        this.dom.stimApplyBtn.addEventListener('click', () => this.applyStimulus());

        // 무반응 스킵 버튼
        this.dom.reactionSkipBtn.addEventListener('click', () => this.skipReaction());

        // 세션 종료
        this.dom.endSessionBtn.addEventListener('click', () => this.endSession());

        // 리포트 닫기 및 저장
        this.dom.reportClose.addEventListener('click', () => this.closeReport());
        this.dom.reportSave.addEventListener('click', async () => {
            const btn = this.dom.reportSave;
            const originalText = btn.innerText;
            btn.innerText = 'DB에 저장 중...';
            btn.disabled = true;

            // Firebase에 데이터 저장
            if (this.currentReportData) {
                await saveSessionReport(this.currentReportData);
            }

            btn.innerText = '저장 완료!';
            btn.classList.add('btn--success');

            setTimeout(() => {
                this.closeReport();
                btn.innerText = originalText;
                btn.classList.remove('btn--success');
                btn.disabled = false;
            }, 1000);
        });
        this.dom.reportOverlay.addEventListener('click', (e) => {
            if (e.target === this.dom.reportOverlay) this.closeReport();
        });

        // 상담 예약 버튼 처리
        if (this.dom.bookingBtn) {
            this.dom.bookingBtn.addEventListener('click', () => this.handleBooking());
        }

        // 세션 관리자 콜백
        this.sessionManager.onTimerUpdate((mins, secs) => {
            this.dom.timerSegments[0].textContent = mins;
            this.dom.timerSegments[1].textContent = secs;
            this.updateTrackingTimer();
        });

        // 반응 감지 시 콜백
        this.sessionManager.onReactionDetected((completedStimulus) => {
            this.finishTracking(completedStimulus);
        });

        // 얼굴 추적 콜백
        this.faceTracker.onResult((analysis) => {
            this.sessionManager.recordFaceData(analysis);
            this.updateMetrics();
        });
    }

    /**
     * 카메라 토글 (시작/정지)
     */
    async toggleCamera() {
        if (this.isCameraActive) {
            this.stopCamera();
        } else {
            await this.startCamera();
        }
    }

    /**
     * 카메라 시작
     */
    async startCamera() {
        try {
            this.cameraStream = await navigator.mediaDevices.getUserMedia({
                video: {
                    facingMode: 'user',
                    width: { ideal: 640 },
                    height: { ideal: 480 },
                }
            });

            this.dom.video.srcObject = this.cameraStream;
            await this.dom.video.play();

            // 캔버스 크기 설정
            this.dom.canvas.width = this.dom.video.videoWidth;
            this.dom.canvas.height = this.dom.video.videoHeight;

            this.isCameraActive = true;
            this.dom.cameraToggleIcon.textContent = 'pause';
            this.dom.liveBadge.style.display = 'inline-flex';
            this.dom.faceMeshOverlay.classList.add('active');

            // 오디오 분석기 시작
            await this.audioAnalyzer.initialize();

            // 세션 시작
            this.sessionManager.start();
            this.updateStatus('호흡 및 반응 추적 중', true);

            // 분석 루프 시작
            this.startAnalysisLoop();

            console.log('[App] Camera started, session active');
        } catch (error) {
            console.error('[App] Camera start failed:', error);
            this.updateStatus('카메라 접근 실패', false);
        }
    }

    /**
     * 카메라 정지
     */
    stopCamera() {
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = null;
        }

        if (this.cameraStream) {
            this.cameraStream.getTracks().forEach(track => track.stop());
            this.cameraStream = null;
        }

        this.dom.video.srcObject = null;
        this.isCameraActive = false;
        this.dom.cameraToggleIcon.textContent = 'videocam';
        this.dom.liveBadge.style.display = 'none';
        this.dom.faceMeshOverlay.classList.remove('active');

        // 캔버스 클리어
        const ctx = this.dom.canvas.getContext('2d');
        ctx.clearRect(0, 0, this.dom.canvas.width, this.dom.canvas.height);

        this.updateStatus('일시 정지', false);
    }

    /**
     * 실시간 분석 루프
     */
    startAnalysisLoop() {
        const loop = () => {
            if (!this.isCameraActive) return;

            // 비디오 프레임 준비 확인
            if (this.dom.video.readyState >= 2) {
                const timestamp = performance.now();

                // 1. 얼굴 추적
                const results = this.faceTracker.detectForVideo(this.dom.video, timestamp);

                // 2. 캔버스에 얼굴 메쉬 그리기
                if (results) {
                    this.faceTracker.drawFaceMesh(this.dom.canvas, results);
                }

                // 3. 오디오 분석
                const audioResult = this.audioAnalyzer.getAnalysis();
                this.sessionManager.recordAudioData(audioResult);
                this.updateAudioUI(audioResult);
            }

            this.animationFrameId = requestAnimationFrame(loop);
        };

        this.animationFrameId = requestAnimationFrame(loop);
    }

    /**
     * 자극 탭 전환
     */
    switchStimTab(category) {
        if (category === 'olfactory') {
            this.dom.tabOlfactory.classList.add('active');
            this.dom.tabAuditory.classList.remove('active');
            this.dom.olfactoryOptions.style.display = 'flex';
            this.dom.auditoryOptions.style.display = 'none';
        } else {
            this.dom.tabAuditory.classList.add('active');
            this.dom.tabOlfactory.classList.remove('active');
            this.dom.auditoryOptions.style.display = 'flex';
            this.dom.olfactoryOptions.style.display = 'none';
        }
    }

    /**
     * 자극 칩 선택
     */
    selectStimChip(targetChip) {
        // 같은 그룹(부모) 내의 칩들만 active 해제
        const parent = targetChip.parentElement;
        parent.querySelectorAll('.stim-chip').forEach(c => c.classList.remove('active'));
        targetChip.classList.add('active');
    }

    /**
     * 자극 적용 시작
     */
    applyStimulus() {
        if (!this.isCameraActive) {
            alert('카메라를 먼저 시작해주세요.');
            return;
        }

        if (this.sessionManager.awaitingReaction) {
            // 이미 추적 중이면 무시
            return;
        }

        // 현재 활성 탭 및 칩 파악
        const isOlfactory = this.dom.tabOlfactory.classList.contains('active');
        const category = isOlfactory ? 'olfactory' : 'auditory';
        const activeContainer = isOlfactory ? this.dom.olfactoryOptions : this.dom.auditoryOptions;
        const activeChip = activeContainer.querySelector('.stim-chip.active');

        if (!activeChip) return;
        const type = activeChip.dataset.stimulus;

        // 세션 매니저에 등록
        this.sessionManager.activateStimulus(category, type);

        // UI 상태 변경 (추적 모드)
        this.dom.stimApplyBtn.classList.add('tracking');
        this.dom.stimApplyIcon.textContent = 'sensors';
        this.dom.stimApplyText.textContent = '반응 대기 중...';
        this.dom.stimApplyBtn.style.pointerEvents = 'none';

        this.dom.reactionTrackerTime.textContent = '0.0초';
        this.dom.reactionTracker.style.display = 'flex';
    }

    /**
     * 타이머 업데이트 시 반응 대기 시간 표시
     */
    updateTrackingTimer() {
        if (!this.sessionManager.awaitingReaction || !this.sessionManager.activeStimulus) return;

        const currentTrackerTime = (performance.now() - this.sessionManager.activeStimulus.startTime) / 1000;
        this.dom.reactionTrackerTime.textContent = `${currentTrackerTime.toFixed(1)}초`;
    }

    /**
     * 반응 무시 (스킵)
     */
    skipReaction() {
        const completedStimulus = this.sessionManager.skipReaction();
        if (completedStimulus) {
            this.finishTracking(completedStimulus);
        }
    }

    /**
     * 반응 기록 완료 및 UI 복구
     */
    finishTracking(logItem) {
        // 버튼 복구
        this.dom.stimApplyBtn.classList.remove('tracking');
        this.dom.stimApplyIcon.textContent = 'play_arrow';
        this.dom.stimApplyText.textContent = '자극 적용';
        this.dom.stimApplyBtn.style.pointerEvents = 'auto';
        this.dom.reactionTracker.style.display = 'none';

        // 로그 추가
        this.appendLogEntry(logItem);
    }

    /**
     * 로그 목록에 새 항목 추가
     */
    appendLogEntry(logItem) {
        this.dom.logSection.style.display = 'block';

        const logCountStr = `${this.sessionManager.stimulusLogs.length}건`;
        this.dom.logCount.textContent = logCountStr;

        const iconMap = {
            'olfactory': 'eco',
            'auditory': 'hearing'
        };
        const titleMap = {
            'lavender': '라벤더', 'orange': '오렌지', 'peppermint': '페퍼민트',
            'eucalyptus': '유칼립투스', 'coffee': '커피', 'vanilla': '바닐라',
            'cedarwood': '시더우드', 'lemon': '레몬',
            'singingbowl_a': '싱잉볼 A', 'singingbowl_b': '싱잉볼 B', 'singingbowl_c': '싱잉볼 C',
            'singingbowl_d': '싱잉볼 D', 'singingbowl_e': '싱잉볼 E', 'singingbowl_f': '싱잉볼 F',
            'singingbowl_g': '싱잉볼 G'
        };

        const title = titleMap[logItem.type] || logItem.type;
        const icon = iconMap[logItem.category] || 'info';

        const m = Math.floor(logItem.displayTime / 60);
        const s = Math.floor(logItem.displayTime % 60);
        const timeStr = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;

        let reactionHtml = '';
        if (logItem.reactionTime > 0) {
            reactionHtml = `<span class="log-item-rt">${logItem.reactionTime.toFixed(1)}초</span>`;
        } else {
            reactionHtml = `<span class="log-item-rt no-reaction">무반응</span>`;
        }

        const el = document.createElement('div');
        el.className = 'log-item';
        el.innerHTML = `
            <div class="log-item-icon ${logItem.category}">
                <span class="material-symbols-outlined">${icon}</span>
            </div>
            <div class="log-item-info">
                <div class="log-item-title">${title} ${logItem.category === 'olfactory' ? '향기' : '소리'}</div>
                <div class="log-item-time">${timeStr}에 제시됨</div>
            </div>
            <div class="log-item-reaction">${reactionHtml}</div>
        `;

        this.dom.stimLog.prepend(el); // 최신순으로 위에 추가
    }

    /**
     * 실시간 지표 UI 업데이트
     */
    updateMetrics() {
        const metrics = this.sessionManager.getCurrentMetrics();

        // 호흡 안정도
        if (metrics.breathing > 0) {
            this.dom.breathingValue.textContent = `${metrics.breathing}%`;
            this.dom.breathingBar.style.width = `${metrics.breathing}%`;
        }

        // 반응 시간
        if (metrics.reactionTime !== null) {
            this.dom.reactionValue.innerHTML = `${metrics.reactionTime}<small>초</small>`;
            const diff = metrics.avgReactionTime ? (metrics.reactionTime - metrics.avgReactionTime).toFixed(1) : '--';
            this.dom.reactionSub.textContent = `평균 대비 ${diff > 0 ? '+' : ''}${diff}s`;
        }

        // 고개 움직임
        if (metrics.headPose) {
            const dir = metrics.headPose.direction;
            const angle = Math.abs(metrics.headPose.yaw);
            this.dom.headValue.innerHTML = `${dir} ${angle}<small>도</small>`;
            this.dom.headSub.textContent = dir === '정면' ? '정면 응시 유지 중' : `${dir} 방향 회전`;
        }

        // 발성 시간
        if (metrics.maxVoiceDuration > 0) {
            this.dom.voiceValue.innerHTML = `${metrics.voiceDuration}<small>초</small>`;
            this.dom.voiceSub.textContent = `최대 지속 ${metrics.maxVoiceDuration}s`;
        }
    }

    /**
     * 오디오 UI 업데이트
     */
    updateAudioUI(audioResult) {
        // dB 값
        this.dom.dbValue.textContent = `${audioResult.db}dB`;

        // dB 바
        this.dom.dbBars.forEach((bar, i) => {
            if (audioResult.bars[i] !== undefined) {
                bar.style.height = `${audioResult.bars[i] * 100}%`;
            }
        });
    }

    /**
     * 상태 배지 업데이트
     */
    updateStatus(text, isActive) {
        this.dom.statusText.textContent = text;

        const dotPing = this.dom.statusBadge.querySelector('.status-dot-ping');
        if (isActive) {
            dotPing.style.animationPlayState = 'running';
        } else {
            dotPing.style.animationPlayState = 'paused';
            dotPing.style.opacity = '0';
        }
    }

    /**
     * 세션 종료 → 리포트 생성 → 리포트 시트 열기
     */
    async endSession() {
        if (!this.sessionManager.isActive) {
            // 세션이 활성화되지 않았으면 데모 리포트 표시
            this.showDemoReport();
            return;
        }

        this.stopCamera();
        this.audioAnalyzer.destroy();

        const report = this.sessionManager.end();
        await this.showReport(report);
    }

    /**
     * 리포트 표시
     */
    async showReport(report) {
        this.currentReportData = report;

        // 호흡 상태
        this.dom.reportBreathingStatus.textContent = report.breathingStatus;

        // 변화율
        const sign = report.breathingChange >= 0 ? '+' : '';
        this.dom.reportBreathingPct.textContent = `${sign}${report.breathingChange}%`;

        // 차트 그리기
        this.drawReportChart(report.chartPoints);

        // 동적 감각 반응 상세 분석 (Detail Stats)
        this.dom.reportResponseCards.innerHTML = '';
        if (report.detailStats && report.detailStats.length > 0) {
            report.detailStats.sort((a, b) => b.responseRate - a.responseRate).forEach(stat => {
                const isOlf = stat.category === 'olfactory';
                const icon = isOlf ? 'airware' : 'headset';
                const colorClass = isOlf ? 'orange' : 'blue';
                const nameMap = {
                    'lavender': '라벤더', 'orange': '오렌지', 'peppermint': '페퍼민트',
                    'eucalyptus': '유칼립투스', 'coffee': '커피', 'vanilla': '바닐라',
                    'cedarwood': '시더우드', 'lemon': '레몬',
                    'singingbowl_a': '싱잉볼 A', 'singingbowl_b': '싱잉볼 B', 'singingbowl_c': '싱잉볼 C',
                    'singingbowl_d': '싱잉볼 D', 'singingbowl_e': '싱잉볼 E', 'singingbowl_f': '싱잉볼 F',
                    'singingbowl_g': '싱잉볼 G'
                };
                const displayName = nameMap[stat.type] || stat.type;
                const titleStr = `${isOlf ? '후각' : '청각'} 자극 (${displayName})`;

                const cardHtml = `
                  <div class="response-card">
                    <div class="response-icon response-icon--${colorClass}">
                      <span class="material-symbols-outlined">${icon}</span>
                    </div>
                    <div class="response-info">
                      <div class="response-info-top">
                        <span class="response-name">${titleStr} <small style="color:#94a3b8;margin-left:4px;font-weight:normal">${stat.reactionCount}/${stat.totalCount}회 반응</small></span>
                        <span class="response-pct">${stat.responseRate}%</span>
                      </div>
                      <div class="response-bar">
                        <div class="response-bar-fill response-bar-fill--${colorClass}" style="width:${stat.responseRate}%"></div>
                      </div>
                    </div>
                  </div>
                `;
                this.dom.reportResponseCards.insertAdjacentHTML('beforeend', cardHtml);
            });
        } else {
            this.dom.reportResponseCards.innerHTML = '<p style="color:var(--text-tertiary);font-size:13px;text-align:center;padding:16px;">측정된 자극 반응 데이터가 없습니다.</p>';
        }

        // 타임라인 그리기
        this.dom.reportTimeline.innerHTML = '';
        if (report.stimulusLogs && report.stimulusLogs.length > 0) {
            const tlHtml = report.stimulusLogs.map(log => {
                const titleMap = {
                    'lavender': '라벤더', 'orange': '오렌지', 'peppermint': '페퍼민트',
                    'eucalyptus': '유칼립투스', 'coffee': '커피', 'vanilla': '바닐라',
                    'cedarwood': '시더우드', 'lemon': '레몬',
                    'singingbowl_a': '싱잉볼 A', 'singingbowl_b': '싱잉볼 B', 'singingbowl_c': '싱잉볼 C',
                    'singingbowl_d': '싱잉볼 D', 'singingbowl_e': '싱잉볼 E', 'singingbowl_f': '싱잉볼 F',
                    'singingbowl_g': '싱잉볼 G'
                };
                const t = titleMap[log.type] || log.type;
                const r = log.reactionTime > 0 ? `${log.reactionTime.toFixed(1)}초 후 반응` : '무반응';
                const c = log.reactionTime > 0 ? 'color:var(--emerald-600)' : 'color:var(--text-tertiary)';
                return `<div style="display:flex; justify-content:space-between; padding:8px 0; border-bottom:1px solid var(--border-light); font-size:13px;">
                           <span><strong>${t}</strong> (${log.category === 'olfactory' ? '후각' : '청각'})</span>
                           <span style="${c}; font-weight:700;">${r}</span>
                        </div>`;
            }).join('');
            this.dom.reportTimeline.innerHTML = tlHtml;
        } else {
            this.dom.reportTimeline.innerHTML = '<p style="color:var(--text-tertiary);font-size:13px;text-align:center;">기록이 없습니다.</p>';
        }

        // 전문가 의견 (기본 로딩 텍스트 적용 후 AI 호출)
        const loadingText = 'AI 전문가가 수집된 데이터를 바탕으로 인사이트를 분석하고 있습니다...💭';
        this.dom.reportRecommendation.textContent = loadingText;

        // 리포트 시트 열기
        this.dom.reportOverlay.classList.add('open');
        document.body.style.overflow = 'hidden';

        // AI 전문가 의견 비동기 요청 (UI 차단 방지)
        this.aiAnalyzer.generateExpertInsight(report).then(aiInsight => {
            // 타이핑 효과를 위한 코드 또는 즉시 반영
            this.dom.reportRecommendation.innerHTML = aiInsight.replace(/\n/g, '<br/>');
        }).catch(err => {
            console.error('AI 분석 실패:', err);
            this.dom.reportRecommendation.textContent = report.recommendation; // 실패시 기존 추천 문구 사용
        });
    }

    /**
     * 데모 리포트 (테스트용 고정 데이터 제거 / 세션 데이터가 없을 경우만 기본 표시)
     */
    showDemoReport() {
        const demoReport = {
            breathingStatus: '기록 없음',
            breathingChange: 0,
            breathing: 0,
            chartPoints: [50, 50],
            detailStats: [],
            stimulusLogs: [],
            recommendation: '세션이 측정되지 않았습니다. 자극을 활성화하고 반응을 수집해주세요.',
        };
        this.showReport(demoReport);
    }

    /**
     * 리포트 차트 그리기 (Chart.js 적용)
     */
    drawReportChart(dataPoints) {
        if (!dataPoints || dataPoints.length < 2) return;

        if (this.chartInstance) {
            this.chartInstance.destroy();
        }

        const ctx = this.dom.reportChartCanvas.getContext('2d');
        const labels = dataPoints.map((_, i) => `${i + 1}`);

        // 그라데이션 만들기
        const gradient = ctx.createLinearGradient(0, 0, 0, 120);
        gradient.addColorStop(0, 'rgba(17, 82, 212, 0.4)');
        gradient.addColorStop(1, 'rgba(17, 82, 212, 0)');

        this.chartInstance = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: '호흡 안정도',
                    data: dataPoints,
                    borderColor: '#1152d4',
                    borderWidth: 2,
                    backgroundColor: gradient,
                    fill: true,
                    tension: 0.4, // 데이터 곡선 스무딩 처리
                    pointRadius: 0,
                    pointHoverRadius: 5
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    x: { display: false },
                    y: {
                        display: false,
                        min: 0,
                        max: 100
                    }
                },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        enabled: true,
                        mode: 'index',
                        intersect: false,
                        callbacks: {
                            label: function (context) {
                                let label = context.dataset.label || '';
                                if (label) {
                                    label += ': ';
                                }
                                if (context.parsed.y !== null) {
                                    label += Math.round(context.parsed.y) + '점';
                                }
                                return label;
                            }
                        }
                    }
                },
                interaction: {
                    mode: 'nearest',
                    axis: 'x',
                    intersect: false
                }
            }
        });
    }

    /**
     * 리포트 닫기
     */
    closeReport() {
        this.dom.reportOverlay.classList.remove('open');
        document.body.style.overflow = '';
        this.updateStatus('카메라 대기 중', false);

        // 컨텐츠 초기화
        this.dom.logSection.style.display = 'none';
        this.dom.stimLog.innerHTML = '';
        this.dom.logCount.textContent = '0건';
        this.sessionManager.Reset();
    }

    /**
     * 전문가 상담 예약 클릭 처리 (카카오 1:1 오픈채팅 연동)
     */
    handleBooking() {
        // 실제 운영 시 상담사의 카카오톡 1:1 오픈채팅방 URL로 교체합니다.
        const kakaoOpenChatUrl = 'https://open.kakao.com/o/sometoken';

        if (confirm('전문가와의 1:1 카카오톡 상담 채팅방으로 이동하시겠습니까?')) {
            window.open(kakaoOpenChatUrl, '_blank');
        }
    }
}

// 앱 시작
const app = new SenseTrackApp();

// 전역 접근 (디버깅용)
window.senseTrack = app;
