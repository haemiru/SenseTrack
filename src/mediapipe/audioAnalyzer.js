/**
 * SenseTrack — Audio Analyzer
 * 
 * Web Audio API를 사용한 실시간 오디오 분석 (dB, 발성 감지).
 * MediaPipe와 함께 다감각 반응을 추적.
 */

export class AudioAnalyzer {
    constructor() {
        this.audioContext = null;
        this.analyser = null;
        this.source = null;
        this.stream = null;
        this.dataArray = null;
        this.isActive = false;

        // 발성 관련 상태
        this.voiceThreshold = 0.05; // 발성 감지 임계값
        this.isVoicing = false;
        this.voiceStartTime = 0;
        this.currentVoiceDuration = 0;
        this.maxVoiceDuration = 0;

        // 콜백
        this._onUpdateCallbacks = [];
    }

    /**
     * 마이크 스트림 초기화
     */
    async initialize() {
        try {
            this.stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true,
                }
            });

            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            this.analyser = this.audioContext.createAnalyser();
            this.analyser.fftSize = 256;
            this.analyser.smoothingTimeConstant = 0.8;

            this.source = this.audioContext.createMediaStreamSource(this.stream);
            this.source.connect(this.analyser);

            this.dataArray = new Float32Array(this.analyser.fftSize);
            this.isActive = true;

            console.log('[AudioAnalyzer] Initialized');
            return true;
        } catch (error) {
            console.error('[AudioAnalyzer] Initialization failed:', error);
            return false;
        }
    }

    /**
     * 현재 오디오 분석 결과 가져오기
     */
    getAnalysis() {
        if (!this.isActive || !this.analyser) {
            return { db: 0, rms: 0, isVoicing: false, voiceDuration: 0, maxDuration: 0, bars: [0, 0, 0, 0] };
        }

        this.analyser.getFloatTimeDomainData(this.dataArray);

        // RMS 계산
        let sum = 0;
        for (let i = 0; i < this.dataArray.length; i++) {
            sum += this.dataArray[i] * this.dataArray[i];
        }
        let rms = Math.sqrt(sum / this.dataArray.length);

        // EMA (Data Smoothing) 필터 적용 (노이즈 감소)
        if (this.smoothedRms === undefined) this.smoothedRms = rms;
        this.smoothedRms = (rms * 0.2) + (this.smoothedRms * 0.8);
        rms = this.smoothedRms;

        // dB 변환
        const db = rms > 0 ? Math.max(0, 20 * Math.log10(rms) + 60) : 0;

        // 발성 감지
        const now = performance.now();
        if (rms > this.voiceThreshold) {
            if (!this.isVoicing) {
                this.isVoicing = true;
                this.voiceStartTime = now;
            }
            this.currentVoiceDuration = (now - this.voiceStartTime) / 1000;
            if (this.currentVoiceDuration > this.maxVoiceDuration) {
                this.maxVoiceDuration = this.currentVoiceDuration;
            }
        } else {
            if (this.isVoicing) {
                this.isVoicing = false;
            }
        }

        // 시각화용 바(4개) 데이터
        const bars = this.generateBars(rms);

        const result = {
            db: Math.round(db),
            rms,
            isVoicing: this.isVoicing,
            voiceDuration: Math.round(this.currentVoiceDuration * 10) / 10,
            maxDuration: Math.round(this.maxVoiceDuration * 10) / 10,
            bars,
        };

        this._onUpdateCallbacks.forEach(cb => cb(result));
        return result;
    }

    /**
     * 오디오 바 시각화 데이터 생성
     */
    generateBars(rms) {
        const base = Math.min(1, rms * 10);
        return [
            Math.max(0.15, base * (0.5 + Math.random() * 0.5)),
            Math.max(0.15, base * (0.6 + Math.random() * 0.4)),
            Math.max(0.15, base * (0.7 + Math.random() * 0.3)),
            Math.max(0.15, base * (0.4 + Math.random() * 0.6)),
        ];
    }

    /**
     * 콜백 등록
     */
    onUpdate(callback) {
        this._onUpdateCallbacks.push(callback);
    }

    /**
     * 상태 초기화 (세션 시작 시)
     */
    resetSession() {
        this.isVoicing = false;
        this.voiceStartTime = 0;
        this.currentVoiceDuration = 0;
        this.maxVoiceDuration = 0;
        this.smoothedRms = undefined;
    }

    /**
     * 리소스 정리
     */
    destroy() {
        if (this.stream) {
            this.stream.getTracks().forEach(track => track.stop());
        }
        if (this.audioContext && this.audioContext.state !== 'closed') {
            this.audioContext.close();
        }
        this.isActive = false;
        this._onUpdateCallbacks = [];
    }
}
