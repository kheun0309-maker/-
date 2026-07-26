# Firebase 설정 (여행방 공유 기능)

1. [Firebase Console](https://console.firebase.google.com/)에서 프로젝트 생성
2. 프로젝트 설정 → 내 앱 → 웹 앱 추가 → `firebaseConfig` 값 복사
3. `js/firebase-config.js`의 값을 붙여넣기
4. Authentication → Sign-in method → **Anonymous** 사용 설정
5. Authentication → Settings → Authorized domains에 추가
   - `localhost`
   - `kheun0309-maker.github.io`
6. Firestore Database 생성 (프로덕션 모드)
7. Firestore Rules 게시 (아래 중 하나)
   - **로컬(권장):** 프로젝트 루트에서
     ```bash
     npm i -g firebase-tools   # 최초 1회
     firebase login
     firebase deploy --only firestore:rules
     ```
     (`firebase.json` · `.firebaserc`가 루트에 있음. 프로젝트: `gen-lang-client-0212008845`)
   - **Console:** Firestore → Rules에 `firebase/firestore.rules` 전체를 붙여넣고 **게시**
   - 확인: `guideSections`의 `sectionId in`에 `resort`, `hopping`, `massage`, `tips`가 있어야 함
   - 일정 변경 알림용 `itinEvents`에 `detail`/`itemId` 필드 포함 — 규칙 변경 후 반드시 다시 게시

**Firebase Storage는 필요 없습니다.** (유료 Blaze 업그레이드 없이 사용)
일정 사진은 파일 업로드 대신 **이미지 URL**을 붙여넣는 방식입니다.

설정이 끝나면 사이트에서 닉네임으로 방을 만들 수 있습니다.
방 코드는 카톡 등으로 **비공개로만** 공유하세요.

일정 편집: 여행방 입장 후 `📅 일자별 일정`에서 수정/드래그/사진 URL/지도 링크 저장이 가능합니다.
