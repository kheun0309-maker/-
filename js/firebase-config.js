/** Firebase 웹 앱 설정 — 제미니 프로젝트 */
export const firebaseConfig = {
  apiKey: 'AIzaSyC46Wov7NrjIs4PTYRCAzVFcJ5Q4DvvHLw',
  authDomain: 'gen-lang-client-0212008845.firebaseapp.com',
  projectId: 'gen-lang-client-0212008845',
  storageBucket: 'gen-lang-client-0212008845.firebasestorage.app',
  messagingSenderId: '476540998510',
  appId: '1:476540998510:web:56497706f6afbc95e1a77f',
  measurementId: 'G-ZTFZJBJE73'
};

export function isFirebaseConfigured() {
  return Boolean(
    firebaseConfig.apiKey
    && !firebaseConfig.apiKey.startsWith('YOUR_')
    && firebaseConfig.projectId
    && !String(firebaseConfig.projectId).startsWith('YOUR_')
  );
}
