/**
 * SenseTrack — MediaPipe Face Landmarker Manager
 * 
 * MediaPipe Face Landmarker를 초기화하고 관리하는 모듈.
 * 478개의 3D 얼굴 랜드마크 + 블렌드쉐이프 추출.
 * 향후 React Native 변환을 고려해 프레임워크 비종속적으로 설계.
 */

import { FaceLandmarker, FilesetResolver, DrawingUtils } from '@mediapipe/tasks-vision';

// 랜드마크 인덱스 상수 (주요 포인트)
const LANDMARKS = {
    NOSE_TIP: 1,
    CHIN: 152,
    LEFT_EYE_OUTER: 33,
    RIGHT_EYE_OUTER: 263,
    LEFT_MOUTH: 61,
    RIGHT_MOUTH: 291,
    FOREHEAD: 10,
    LEFT_CHEEK: 234,
    RIGHT_CHEEK: 454,
};

export class FaceTracker {
    constructor() {
        this.faceLandmarker = null;
        this.drawingUtils = null;
        this.isReady = false;
        this.lastResults = null;
        this._onResultCallbacks = [];
    }

    /**
     * MediaPipe FaceLandmarker 초기화
     */
    async initialize() {
        try {
            const vision = await FilesetResolver.forVisionTasks(
                'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm'
            );

            this.faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
                baseOptions: {
                    modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
                    delegate: 'GPU',
                },
                outputFaceBlendshapes: true,
                outputFacialTransformationMatrixes: true,
                runningMode: 'VIDEO',
                numFaces: 1,
            });

            this.isReady = true;
            console.log('[FaceTracker] MediaPipe Face Landmarker initialized');
            return true;
        } catch (error) {
            console.error('[FaceTracker] Initialization failed:', error);
            // GPU 실패 시 CPU 폴백
            try {
                const vision = await FilesetResolver.forVisionTasks(
                    'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm'
                );
                this.faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
                    baseOptions: {
                        modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
                        delegate: 'CPU',
                    },
                    outputFaceBlendshapes: true,
                    outputFacialTransformationMatrixes: true,
                    runningMode: 'VIDEO',
                    numFaces: 1,
                });
                this.isReady = true;
                console.log('[FaceTracker] Fallback to CPU delegate');
                return true;
            } catch (fallbackError) {
                console.error('[FaceTracker] CPU fallback also failed:', fallbackError);
                return false;
            }
        }
    }

    /**
     * 비디오 프레임 처리
     * @param {HTMLVideoElement} video
     * @param {number} timestamp - performance.now() 기반
     */
    detectForVideo(video, timestamp) {
        if (!this.isReady || !this.faceLandmarker) return null;

        try {
            const results = this.faceLandmarker.detectForVideo(video, timestamp);
            this.lastResults = results;

            // 콜백 호출
            if (results.faceLandmarks && results.faceLandmarks.length > 0) {
                const analysis = this.analyzeResults(results);
                this._onResultCallbacks.forEach(cb => cb(analysis, results));
            }

            return results;
        } catch (e) {
            // 간헐적 프레임 에러 무시
            return null;
        }
    }

    /**
     * 결과 분석 — 고개 각도, 입 벌림, 눈 깜빡임 등
     */
    analyzeResults(results) {
        if (!results.faceLandmarks || results.faceLandmarks.length === 0) {
            return null;
        }

        const landmarks = results.faceLandmarks[0];
        const blendshapes = results.faceBlendshapes?.[0]?.categories || [];

        // 1. 고개 방향 계산 (Yaw, Pitch, Roll)
        const headPose = this.calculateHeadPose(landmarks);

        // 2. 입 벌림 정도
        const mouthOpen = this.getBlendshapeValue(blendshapes, 'jawOpen');

        // 3. 눈 깜빡임
        const leftEyeBlink = this.getBlendshapeValue(blendshapes, 'eyeBlinkLeft');
        const rightEyeBlink = this.getBlendshapeValue(blendshapes, 'eyeBlinkRight');

        // 4. 눈썹 올림
        const browUp = (
            this.getBlendshapeValue(blendshapes, 'browInnerUp') +
            this.getBlendshapeValue(blendshapes, 'browOuterUpLeft') +
            this.getBlendshapeValue(blendshapes, 'browOuterUpRight')
        ) / 3;

        // 5. 미소
        const smile = (
            this.getBlendshapeValue(blendshapes, 'mouthSmileLeft') +
            this.getBlendshapeValue(blendshapes, 'mouthSmileRight')
        ) / 2;

        return {
            headPose,
            mouthOpen,
            leftEyeBlink,
            rightEyeBlink,
            browUp,
            smile,
            landmarks,
            blendshapes,
        };
    }

    /**
     * 고개 방향 계산 (간이 Yaw/Pitch)
     */
    calculateHeadPose(landmarks) {
        const nose = landmarks[LANDMARKS.NOSE_TIP];
        const chin = landmarks[LANDMARKS.CHIN];
        const leftEye = landmarks[LANDMARKS.LEFT_EYE_OUTER];
        const rightEye = landmarks[LANDMARKS.RIGHT_EYE_OUTER];
        const forehead = landmarks[LANDMARKS.FOREHEAD];

        // Yaw (좌우 회전) — 코와 양쪽 눈 거리 비율
        const leftDist = Math.sqrt(
            Math.pow(nose.x - leftEye.x, 2) + Math.pow(nose.y - leftEye.y, 2)
        );
        const rightDist = Math.sqrt(
            Math.pow(nose.x - rightEye.x, 2) + Math.pow(nose.y - rightEye.y, 2)
        );
        const yawRatio = (leftDist - rightDist) / (leftDist + rightDist);
        let yaw = yawRatio * 90; // 대략적인 각도

        // Pitch (상하 회전) — 코와 이마/턱 거리 비율
        const foreheadDist = Math.abs(nose.y - forehead.y);
        const chinDist = Math.abs(chin.y - nose.y);
        const pitchRatio = (chinDist - foreheadDist) / (chinDist + foreheadDist);
        let pitch = pitchRatio * 60;

        // EMA (Data Smoothing) 필터 적용 (화면 떨림 감소)
        if (!this.smoothedHeadPose) {
            this.smoothedHeadPose = { yaw, pitch };
        } else {
            this.smoothedHeadPose.yaw = (yaw * 0.3) + (this.smoothedHeadPose.yaw * 0.7);
            this.smoothedHeadPose.pitch = (pitch * 0.3) + (this.smoothedHeadPose.pitch * 0.7);
        }
        yaw = this.smoothedHeadPose.yaw;
        pitch = this.smoothedHeadPose.pitch;

        // 방향 텍스트
        let direction = '정면';
        if (Math.abs(yaw) > 10) {
            direction = yaw > 0 ? '좌측' : '우측';
        }
        if (Math.abs(pitch) > 10) {
            direction = pitch > 0 ? '하단' : '상단';
        }

        return {
            yaw: Math.round(yaw * 10) / 10,
            pitch: Math.round(pitch * 10) / 10,
            direction,
            angle: Math.round(Math.abs(yaw)),
        };
    }

    getBlendshapeValue(blendshapes, name) {
        const shape = blendshapes.find(b => b.categoryName === name);
        return shape ? shape.score : 0;
    }

    /**
     * 캔버스에 얼굴 메쉬 그리기
     */
    drawFaceMesh(canvas, results) {
        if (!results?.faceLandmarks?.length) return;

        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        if (!this.drawingUtils) {
            this.drawingUtils = new DrawingUtils(ctx);
        }

        for (const landmarks of results.faceLandmarks) {
            // 얼굴 윤곽 (테셀레이션)
            this.drawingUtils.drawConnectors(
                landmarks,
                FaceLandmarker.FACE_LANDMARKS_TESSELATION,
                { color: 'rgba(17, 82, 212, 0.15)', lineWidth: 0.5 }
            );

            // 윤곽선
            this.drawingUtils.drawConnectors(
                landmarks,
                FaceLandmarker.FACE_LANDMARKS_FACE_OVAL,
                { color: 'rgba(17, 82, 212, 0.4)', lineWidth: 1.5 }
            );

            // 눈
            this.drawingUtils.drawConnectors(
                landmarks,
                FaceLandmarker.FACE_LANDMARKS_LEFT_EYE,
                { color: 'rgba(52, 211, 153, 0.5)', lineWidth: 1 }
            );
            this.drawingUtils.drawConnectors(
                landmarks,
                FaceLandmarker.FACE_LANDMARKS_RIGHT_EYE,
                { color: 'rgba(52, 211, 153, 0.5)', lineWidth: 1 }
            );

            // 입
            this.drawingUtils.drawConnectors(
                landmarks,
                FaceLandmarker.FACE_LANDMARKS_LIPS,
                { color: 'rgba(249, 115, 22, 0.5)', lineWidth: 1 }
            );
        }
    }

    /**
     * 결과 콜백 등록
     */
    onResult(callback) {
        this._onResultCallbacks.push(callback);
    }

    /**
     * 리소스 정리
     */
    destroy() {
        if (this.faceLandmarker) {
            this.faceLandmarker.close();
            this.faceLandmarker = null;
        }
        this.isReady = false;
        this._onResultCallbacks = [];
    }
}
