/** Firebase 웹 앱 설정 — firebase/SETUP.md 참고 후 값을 교체하세요. */
export const firebaseConfig = {
  apiKey: 'YOUR_API_KEY',
  authDomain: 'YOUR_PROJECT.firebaseapp.com',
  projectId: 'YOUR_PROJECT_ID',
  storageBucket: 'YOUR_PROJECT.appspot.com',
  messagingSenderId: 'YOUR_SENDER_ID',
  appId: 'YOUR_APP_ID'
};

export function isFirebaseConfigured() {
  return Boolean(
    firebaseConfig.apiKey
    && !firebaseConfig.apiKey.startsWith('YOUR_')
    && firebaseConfig.projectId
    && !String(firebaseConfig.projectId).startsWith('YOUR_')
  );
}
