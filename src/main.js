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
import {
    saveSessionReport,
    getCurrentUser,
    onAuthChange,
    signInWithProvider,
    signInViaBookshop,
    signOut,
} from './supabase.js';
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

        // 인증
        this.currentUser = null;
        this.PENDING_KEY = 'sensetrack_pending_report'; // OAuth 리다이렉트 중 임시 보관

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
        this.initAuth();
        this.updateStatus('준비 중', false);

        // MediaPipe 사전 로드
        this.updateStatus('AI 모델 로딩 중...', false);
        const faceReady = await this.faceTracker.initialize();

        if (faceReady) {
            this.updateStatus('카메라 대기 중', false);
        } else {
            this.updateStatus('모델 로딩 실패', false);
        }

        // 시작 시 카메라가 꺼져 있으므로 '자극 적용' 버튼을 잠금 상태로 표시
        this.syncStimButtonState();
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

            // Auth
            authChip: document.getElementById('authChip'),
            authChipIcon: document.getElementById('authChipIcon'),
            authChipText: document.getElementById('authChipText'),
            loginOverlay: document.getElementById('loginOverlay'),
            loginClose: document.getElementById('loginClose'),
            loginGoogle: document.getElementById('loginGoogle'),
            loginKakao: document.getElementById('loginKakao'),
            loginNaver: document.getElementById('loginNaver'),
            loginSkip: document.getElementById('loginSkip'),
            saveNotice: document.getElementById('saveNotice'),
            saveNoticeText: document.getElementById('saveNoticeText'),

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
            stimApplyHint: document.getElementById('stimApplyHint'),
            reactionTracker: document.getElementById('reactionTracker'),
            reactionTrackerTime: document.getElementById('reactionTrackerTime'),
            reactionTrackerLabel: document.querySelector('.reaction-tracker-label'),
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
            reportBreathingChange: document.getElementById('reportBreathingChange'),
            reportChartLabel: document.querySelector('.report-chart-label'),
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
        this.dom.reportSave.addEventListener('click', () => this.handleSaveReport());
        this.dom.reportOverlay.addEventListener('click', (e) => {
            if (e.target === this.dom.reportOverlay) this.closeReport();
        });

        // 상담 예약 버튼 처리
        if (this.dom.bookingBtn) {
            this.dom.bookingBtn.addEventListener('click', () => this.handleBooking());
        }

        // 인증 / 로그인 모달
        this.dom.authChip.addEventListener('click', () => this.handleAuthChip());
        this.dom.loginClose.addEventListener('click', () => this.closeLoginModal());
        this.dom.loginSkip.addEventListener('click', () => this.closeLoginModal());
        this.dom.loginOverlay.addEventListener('click', (e) => {
            if (e.target === this.dom.loginOverlay) this.closeLoginModal();
        });
        this.dom.loginGoogle.addEventListener('click', () => this.startLogin('google'));
        this.dom.loginKakao.addEventListener('click', () => this.startLogin('kakao'));
        this.dom.loginNaver.addEventListener('click', () => this.startLogin('naver'));

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

            // 카메라가 켜졌으니 '자극 적용' 버튼 잠금 해제
            this.syncStimButtonState();

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

        // 카메라가 꺼졌으니 '자극 적용' 버튼 다시 잠금
        this.syncStimButtonState();

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

                // 4. 반응 추적 중이면 프레임마다 트래커 갱신
                //    (setInterval 타이머와 무관하게 매 프레임 시간/움직임% 반영)
                if (this.sessionManager.awaitingReaction) {
                    this.updateTrackingTimer();
                }
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
     * 카메라 활성 여부에 따라 '자극 적용' 버튼의 잠금/안내 상태를 동기화.
     * 추적 중(tracking)일 때는 건드리지 않는다.
     */
    syncStimButtonState() {
        if (this.sessionManager.awaitingReaction) return;

        if (this.isCameraActive) {
            this.dom.stimApplyBtn.classList.remove('locked');
            this.dom.stimApplyHint.textContent = '자극을 줄 때 눌러주세요';
        } else {
            this.dom.stimApplyBtn.classList.add('locked');
            this.dom.stimApplyHint.textContent = '카메라를 먼저 시작하세요';
        }
    }

    /**
     * 자극 적용 시작
     */
    applyStimulus() {
        if (!this.isCameraActive) {
            // 잠금 상태이므로 카메라 시작을 안내하고, 카메라 버튼을 시각적으로 강조
            this.dom.stimApplyHint.textContent = '⚠ 카메라를 먼저 시작하세요 (영상 속 카메라 버튼)';
            this.dom.cameraToggle.classList.add('attention');
            setTimeout(() => this.dom.cameraToggle.classList.remove('attention'), 1600);
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
        if (this.dom.reactionTrackerLabel) {
            this.dom.reactionTrackerLabel.textContent = '반응 추적 중... (움직임 0%)';
        }
        this.dom.reactionTracker.style.display = 'flex';
    }

    /**
     * 타이머 업데이트 시 반응 대기 시간 표시
     */
    updateTrackingTimer() {
        if (!this.sessionManager.awaitingReaction || !this.sessionManager.activeStimulus) return;

        const currentTrackerTime = (performance.now() - this.sessionManager.activeStimulus.startTime) / 1000;
        this.dom.reactionTrackerTime.textContent = `${currentTrackerTime.toFixed(1)}초`;

        // 실시간 '움직임 강도'(%) 표시 — 100%에 도달하면 반응으로 감지된다.
        // 움직여도 0%에 머물면 카메라/얼굴 인식 문제, 낮게만 오르면 임계값 문제로 진단 가능.
        if (this.dom.reactionTrackerLabel) {
            const pct = Math.round(Math.min(1, this.sessionManager.reactionProgress || 0) * 100);
            this.dom.reactionTrackerLabel.textContent = `반응 추적 중... (움직임 ${pct}%)`;
        }
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

        // 카메라 상태에 맞춰 버튼/안내 문구 복구
        this.syncStimButtonState();

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
            const kind = logItem.reactionLabel
                ? `<small style="display:block;color:#94a3b8;font-weight:normal;font-size:11px;">${logItem.reactionLabel}</small>`
                : '';
            reactionHtml = `<span class="log-item-rt">${logItem.reactionTime.toFixed(1)}초${kind}</span>`;
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
        this.applyPreviousSessionComparison(report);
        await this.showReport(report);
    }

    /**
     * 이전 세션(같은 기기/브라우저의 직전 측정) 대비 호흡 안정도 변화를 계산.
     * Supabase는 익명 INSERT 전용(읽기 차단) + 사용자 식별이 없어 공유 DB에서
     * '내 직전 세션'을 특정할 수 없으므로 localStorage를 기준으로 비교한다.
     * 이전 기록이 없으면 generateReport의 '세션 내 변화'를 그대로 사용한다.
     */
    applyPreviousSessionComparison(report) {
        const KEY = 'sensetrack_last_session';
        let prev = null;
        try { prev = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { prev = null; }

        if (prev && typeof prev.breathing === 'number' && prev.breathing > 0) {
            report.breathingChange = Math.round(((report.breathing - prev.breathing) / prev.breathing) * 100);
            report.comparisonBasis = 'previous';
            report.comparisonLabel = '지난 측정 대비';
            report.previousBreathing = prev.breathing;
        } else {
            // 이전 기록 없음 → '측정 중 변화'(초반 vs 후반) 유지
            report.comparisonBasis = 'session';
            report.comparisonLabel = '측정 중 변화';
        }

        // 이번 세션을 직전 기록으로 저장 → 다음 세션이 '이전 세션 대비'로 비교
        try {
            localStorage.setItem(KEY, JSON.stringify({
                breathing: report.breathing,
                breathingStatus: report.breathingStatus,
            }));
        } catch { /* localStorage 미지원 환경 무시 */ }
    }

    /**
     * 리포트 표시
     */
    async showReport(report) {
        this.currentReportData = report;

        // 호흡 상태
        this.dom.reportBreathingStatus.textContent = report.breathingStatus;

        // 변화율 + 비교 기준 (이전 세션 대비 / 세션 내 변화)
        const change = Number(report.breathingChange) || 0;
        const sign = change >= 0 ? '+' : '';
        this.dom.reportBreathingPct.textContent = `${sign}${change}%`;

        const comparisonLabel = report.comparisonLabel || '측정 중 변화';
        if (this.dom.reportChartLabel) {
            this.dom.reportChartLabel.textContent = `호흡 안정도 · ${comparisonLabel}`;
        }
        if (this.dom.reportBreathingChange) {
            const badgeIcon = this.dom.reportBreathingChange.querySelector('.material-symbols-outlined');
            if (badgeIcon) badgeIcon.textContent = change >= 0 ? 'trending_up' : 'trending_down';
            this.dom.reportBreathingChange.classList.toggle('report-badge--down', change < 0);
        }

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

                // 반응 속도 + 반응 종류 요약
                let subText;
                if (stat.reactionCount > 0) {
                    const spd = stat.avgReactionTime
                        ? `평균 ${stat.avgReactionTime.toFixed(1)}초${stat.speedLabel ? ` (${stat.speedLabel})` : ''}`
                        : '';
                    const kindStr = (stat.reactionKinds && stat.reactionKinds.length)
                        ? ` · 주 반응: ${stat.reactionKinds.map(k => k.count > 1 ? `${k.kind} ${k.count}회` : k.kind).join(', ')}`
                        : '';
                    subText = `${spd}${kindStr}`;
                } else {
                    subText = '반응 없음';
                }

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
                      <div class="response-sub" style="margin-top:6px;font-size:12px;color:var(--text-tertiary);">${subText}</div>
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
                const kindStr = (log.reactionTime > 0 && log.reactionLabel) ? ` · ${log.reactionLabel}` : '';
                const r = log.reactionTime > 0 ? `${log.reactionTime.toFixed(1)}초 후 반응${kindStr}` : '무반응';
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
            recommendation: '아직 측정이 진행되지 않았습니다. 자극을 활성화하고 반응을 수집해주세요.',
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
        // 짱샘 1:1 카카오톡 오픈채팅방
        const kakaoOpenChatUrl = 'https://open.kakao.com/o/s3YnSoni';

        if (confirm('짱샘과의 1:1 카카오톡 상담 채팅방으로 이동하시겠습니까?')) {
            window.open(kakaoOpenChatUrl, '_blank');
        }
    }

    // ===================== 인증 / 저장 =====================

    /**
     * 인증 초기화: 현재 세션 확인 + 상태 변화 구독 + OAuth 복귀 후 임시 저장 처리
     */
    async initAuth() {
        this.currentUser = await getCurrentUser();
        this.updateAuthUI();

        // 로그인 상태가 바뀌면 UI 갱신
        onAuthChange((user) => {
            const wasLoggedOut = !this.currentUser;
            this.currentUser = user;
            this.updateAuthUI();
            // 방금 로그인했고, 리다이렉트 전에 보관해 둔 리포트가 있으면 자동 저장
            if (wasLoggedOut && user) this.flushPendingReport();
        });

        // 새로고침/리다이렉트 복귀 시점에도 한 번 시도
        if (this.currentUser) this.flushPendingReport();
    }

    /**
     * 헤더 로그인 칩 + 저장 안내 문구를 로그인 상태에 맞게 갱신
     */
    updateAuthUI() {
        const user = this.currentUser;
        if (user) {
            // 로그인 상태: 명확하게 '로그아웃' 버튼으로 표시(계정은 hover 툴팁으로)
            const label = user.email || user.user_metadata?.name || '';
            this.dom.authChipIcon.textContent = 'logout';
            this.dom.authChipText.textContent = '로그아웃';
            this.dom.authChip.classList.add('auth-chip--in');
            this.dom.authChip.title = label ? `${label} — 로그아웃` : '로그아웃';
        } else {
            this.dom.authChipIcon.textContent = 'login';
            this.dom.authChipText.textContent = '로그인';
            this.dom.authChip.classList.remove('auth-chip--in');
            this.dom.authChip.title = '로그인';
        }

        // 저장 안내 문구
        if (this.dom.saveNoticeText) {
            this.dom.saveNoticeText.innerHTML = user
                ? '이 기록을 보관하려면 아래 <strong>저장</strong>을 눌러주세요. 저장하지 않으면 다음에 다시 볼 수 없어요.'
                : '<strong>로그인 후 저장</strong>하면 기록이 보관되어 다음에 다시 볼 수 있어요. 저장하지 않으면 오늘만 보입니다.';
        }
    }

    /**
     * 헤더 칩 클릭: 로그아웃 상태면 로그인 모달, 로그인 상태면 로그아웃 확인
     */
    async handleAuthChip() {
        if (this.currentUser) {
            if (confirm('로그아웃 하시겠습니까?')) {
                await signOut();
                this.currentUser = null;
                this.updateAuthUI();
            }
        } else {
            this.openLoginModal();
        }
    }

    openLoginModal() {
        this.dom.loginOverlay.classList.add('open');
        document.body.style.overflow = 'hidden';
    }

    closeLoginModal() {
        this.dom.loginOverlay.classList.remove('open');
        // 리포트가 열려있지 않을 때만 스크롤 복구
        if (!this.dom.reportOverlay.classList.contains('open')) {
            document.body.style.overflow = '';
        }
    }

    /**
     * 로그인 시작. google/kakao는 Supabase 네이티브 OAuth,
     * naver는 Supabase 미지원이라 책방 로그인 페이지로 위임.
     * 리다이렉트로 리포트가 사라지지 않도록 현재 리포트를 임시 보관한다.
     */
    async startLogin(provider) {
        if (this.currentReportData) {
            try {
                sessionStorage.setItem(this.PENDING_KEY, JSON.stringify(this.currentReportData));
            } catch { /* 무시 */ }
        }

        if (provider === 'naver') {
            signInViaBookshop();
            return;
        }

        const { error } = await signInWithProvider(provider);
        if (error) {
            console.error('[Auth] 로그인 실패:', error);
            alert('로그인을 시작하지 못했습니다. 책방 로그인 페이지에서 로그인 후 다시 시도해주세요.');
            signInViaBookshop();
        }
    }

    /**
     * OAuth 복귀 후, 로그인돼 있고 임시 보관된 리포트가 있으면 자동 저장하고 리포트를 다시 연다.
     */
    async flushPendingReport() {
        let pending = null;
        try { pending = JSON.parse(sessionStorage.getItem(this.PENDING_KEY) || 'null'); } catch { pending = null; }
        if (!pending) return;
        sessionStorage.removeItem(this.PENDING_KEY);

        const result = await saveSessionReport(pending);
        if (result.ok) {
            this.currentReportData = pending;
            // 리포트 시트를 다시 보여주고 저장 완료를 알림
            await this.showReport(pending);
            const btn = this.dom.reportSave;
            btn.innerText = '저장 완료!';
            btn.classList.add('btn--success');
            btn.disabled = true;
            setTimeout(() => {
                this.closeReport();
                btn.innerText = '분석 보고서 저장 및 닫기';
                btn.classList.remove('btn--success');
                btn.disabled = false;
            }, 1200);
        }
    }

    /**
     * 저장 버튼 클릭: 로그인 안 됐으면 로그인 모달, 로그인 됐으면 저장
     */
    async handleSaveReport() {
        if (!this.currentReportData) return;

        if (!this.currentUser) {
            // 최신 세션을 한 번 더 확인 (다른 탭에서 로그인했을 수 있음)
            this.currentUser = await getCurrentUser();
            this.updateAuthUI();
        }

        if (!this.currentUser) {
            this.openLoginModal();
            return;
        }

        const btn = this.dom.reportSave;
        const originalText = btn.innerText;
        btn.innerText = 'DB에 저장 중...';
        btn.disabled = true;

        const result = await saveSessionReport(this.currentReportData);

        if (result.ok) {
            btn.innerText = '저장 완료!';
            btn.classList.add('btn--success');
            setTimeout(() => {
                this.closeReport();
                btn.innerText = originalText;
                btn.classList.remove('btn--success');
                btn.disabled = false;
            }, 1000);
        } else if (result.reason === 'not_authenticated') {
            btn.innerText = originalText;
            btn.disabled = false;
            this.openLoginModal();
        } else {
            btn.innerText = '저장 실패 — 다시 시도';
            btn.classList.add('btn--error');
            btn.disabled = false;
            setTimeout(() => {
                btn.innerText = originalText;
                btn.classList.remove('btn--error');
            }, 2500);
        }
    }
}

// 앱 시작
const app = new SenseTrackApp();

// 전역 접근 (디버깅용)
window.senseTrack = app;
