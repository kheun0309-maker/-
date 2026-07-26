# Firebase 설정 (여행방 공유 기능)

1. [Firebase Console](https://console.firebase.google.com/)에서 프로젝트 생성
2. 프로젝트 설정 → 내 앱 → 웹 앱 추가 → `firebaseConfig` 값 복사
3. `js/firebase-config.js`의 값을 붙여넣기
4. Authentication → Sign-in method → **Anonymous** 사용 설정
5. Authentication → Settings → Authorized domains에 추가
   - `localhost`
   - `kheun0309-maker.github.io`
6. Firestore Database 생성 (프로덕션 모드)
7. Firestore → Rules에 `firebase/firestore.rules` 내용 붙여넣고 게시
8. Storage 시작하기 → Rules에 `firebase/storage.rules` 붙여넣고 게시
   (일정 사진 업로드용)

설정이 끝나면 사이트에서 닉네임으로 방을 만들 수 있습니다.
방 코드는 카톡 등으로 **비공개로만** 공유하세요.

일정 편집: 여행방 입장 후 `📅 일자별 일정`에서 수정/드래그/사진 업로드/지도 링크 저장이 가능합니다.
