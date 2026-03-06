import { initializeApp } from 'firebase/app';
import { getFirestore, collection, addDoc } from 'firebase/firestore';

// Todo: Firebase 콘솔에서 발급받은 실제 설정값으로 교체해주세요
const firebaseConfig = {
    apiKey: "***REMOVED***",
    authDomain: "sensetrack-8b5c0.firebaseapp.com",
    projectId: "sensetrack-8b5c0",
    storageBucket: "sensetrack-8b5c0.firebasestorage.app",
    messagingSenderId: "125028947877",
    appId: "1:125028947877:web:0e9561601acc6e235f3a4c",
    measurementId: "G-4JRQD8HFXJ"
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
