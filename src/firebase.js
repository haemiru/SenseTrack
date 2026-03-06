import { initializeApp } from 'firebase/app';
import { getFirestore, collection, addDoc } from 'firebase/firestore';

// Firebase 설정값은 .env 파일에서 환경변수로 불러옵니다 (.env.example 참조)
const firebaseConfig = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID,
    measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

export const saveSessionReport = async (reportData) => {
    try {
        const docRef = await addDoc(collection(db, "sessions"), {
            ...reportData,
            timestamp: new Date()
        });
        console.log("Firebase DB 저장 완료. Document ID: ", docRef.id);
        return docRef.id;
    } catch (e) {
        console.error("Firebase DB 저장 중 오류 발생: ", e);
        return null;
    }
};
