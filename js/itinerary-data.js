/** 기본 일정 시드 (방 최초 입장 시 Firestore에 복사) */
export const DEFAULT_DAYS = [
  {
    id: 'day1',
    badge: 'DAY 1 · 8/13 목',
    title: '야간 도착 & 리조트 휴식',
    subtitle: '늦게 도착하니 이동만 하고 바로 잡니다.',
    coverUrl: './images/kkia-airport.jpg',
    items: [
      {
        time: '16:15~',
        place: '인천공항 T2',
        task: '체크인 · 출국',
        note: 'KE5761 기준 19:15 출발 → 최소 16:30 전 공항 도착 권장',
        imageUrl: '',
        placeMapsUrl: 'https://www.google.com/maps/search/?api=1&query=Incheon%20Airport%20T2'
      },
      {
        time: '19:15',
        place: 'ICN → BKI',
        task: 'KE5761 이륙',
        note: '비행 약 5시간 20분 · 기내 눈가리개·양말 챙기기',
        imageUrl: '',
        placeMapsUrl: ''
      },
      {
        time: '23:35',
        place: 'KKIA T1',
        task: '입국 · 수하물 · 픽업 미팅',
        note: '수하물 → 도착홀에서 Shangri-La/이름 피켓. 상세는 ‘🏨 리조트 → 공항픽업’ 참고. 안 보이면 +60 88-797-888',
        imageUrl: '',
        placeMapsUrl: 'https://www.google.com/maps/search/?api=1&query=Kota%20Kinabalu%20International%20Airport'
      },
      {
        time: '00:20~',
        place: '라사 리아',
        task: '체크인 · 휴식',
        note: '공항에서 약 45분. 늦은 도착이라 심야 할증 여부만 확인 후 바로 취침',
        imageUrl: '',
        placeMapsUrl: 'https://www.google.com/maps/search/?api=1&query=Shangri-La%20Rasa%20Ria%20Resort'
      }
    ]
  },
  {
    id: 'day2',
    badge: 'DAY 2 · 8/14 금',
    title: '리조트 풀데이 + 반딧불이',
    subtitle: '늦잠·수영으로 쉬고, 저녁은 리조트 반딧불이 투어.',
    coverUrl: './images/mangrove-boat.jpg',
    items: [
      {
        time: '늦잠',
        place: '라사 리아',
        task: '여유롭게 기상 · 조식',
        note: '',
        imageUrl: '',
        placeMapsUrl: 'https://www.google.com/maps/search/?api=1&query=Shangri-La%20Rasa%20Ria%20Resort'
      },
      {
        time: '오전~오후',
        place: '비치 / 풀',
        task: '수영 · 산책 · 휴식',
        note: '시내 일정 없음. 선크림·모자·수분 보충',
        imageUrl: '',
        placeMapsUrl: ''
      },
      {
        time: '낮',
        place: 'Activity Information Centre',
        task: '반딧불이 투어 예약·확인',
        note: 'Garden Wing The Shop(2층) 또는 Ocean Wing에서 예약. 당일 취소 가능 여부 확인',
        imageUrl: '',
        placeMapsUrl: ''
      },
      {
        time: '저녁',
        place: '리조트 리버 크루즈',
        task: 'Sunset Cruise & Fireflies Watching',
        note: '리조트 공식 프로그램 · 약 2시간 30분\n성인 MYR 180 / 아동(4–11) MYR 95 (SST 포함)\n모기약·얇은 긴팔·미끄럼 방지 신발 착용',
        imageUrl: '',
        placeMapsUrl: ''
      },
      {
        time: '밤',
        place: '리조트',
        task: '귀가 · 휴식',
        note: '내일 호핑을 위해 일찍 자는 편이 좋음',
        imageUrl: '',
        placeMapsUrl: ''
      }
    ]
  },
  {
    id: 'day3',
    badge: 'DAY 3 · 8/15 토',
    title: '호핑투어 + 시내 저녁',
    subtitle: '리조트가 멀어서 아침 일찍 시내/선착장으로 나갑니다.',
    coverUrl: './images/manukan-beach.jpg',
    items: [
      {
        time: '06:30~',
        place: '라사 리아 → 시내',
        task: '그랩/리조트 차량으로 이동',
        note: '시내·제티까지 보통 45~60분. 호핑 집결 시간에 맞춰 전날 픽업 예약',
        imageUrl: '',
        placeMapsUrl: ''
      },
      {
        time: '오전~오후',
        place: '티만만 · 마뭉군 · 수피 등',
        task: '섬 호핑 · 스노클링',
        note: '수영복·래시가드·방수팩·여분 옷·현금. 점심은 상품에 포함되는지 확인',
        imageUrl: '',
        placeMapsUrl: 'https://www.google.com/maps/search/?api=1&query=Manukan%20Island%20Sabah'
      },
      {
        time: '17:30~',
        place: '시내 (제티 근처)',
        task: '샤워·옷 갈아입기 후 저녁',
        note: '해산물·가야스트리트/워터프론트 쪽 식사 추천',
        imageUrl: '',
        placeMapsUrl: 'https://www.google.com/maps/search/?api=1&query=Jesselton%20Quay%20Kota%20Kinabalu'
      },
      {
        time: '19:30~',
        place: '시내 스파 (Warisan / Asia City)',
        task: '마사지',
        note: '추천: Sunset Kinabalu · Chillax(Warisan) · Kama\'A(Asia City). 발 60분 MYR 45~70 / 전신 60분 MYR 60~120. 상세는 앱 ‘마사지’ 섹션. 끝나면 그랩으로 리조트 복귀(밤길 50분 내외)',
        imageUrl: '',
        placeMapsUrl: 'https://www.google.com/maps/search/?api=1&query=Warisan+Square+Kota+Kinabalu'
      }
    ]
  },
  {
    id: 'day4',
    badge: 'DAY 4 · 8/16 일',
    title: '체크아웃 · 시내 · 귀국 대기',
    subtitle: '낮에는 시내, 밤은 공항으로. 서울은 17일 새벽 도착.',
    coverUrl: './images/gaya-market.jpg',
    items: [
      {
        time: '오전',
        place: '라사 리아',
        task: '조식 · 체크아웃',
        note: '캐리어는 시내 락커/트렌스퍼 차량에 실을지, 공항으로 직행할지 전날 결정',
        imageUrl: '',
        placeMapsUrl: ''
      },
      {
        time: '낮',
        place: '시내',
        task: '쇼핑 · 맛집',
        note: '임필리아 / 필리피노 마켓 / 가야 스트리트 · 맛집은 아래 ‘시내 추천 맛집’ 참고',
        imageUrl: '',
        placeMapsUrl: 'https://www.google.com/maps/search/?api=1&query=Gaya%20Street%20Kota%20Kinabalu'
      },
      {
        time: '저녁',
        place: '시내 또는 공항',
        task: '여유 식사 · 공항 이동',
        note: '늦은 비행이면 아래 ‘늦게 쉴 대안’ 참고. 리조트에서 바로 가면 여유를 두고 출발',
        imageUrl: '',
        placeMapsUrl: ''
      },
      {
        time: '00:35',
        place: 'BKI → ICN',
        task: 'KE5762 이륙 (추천·미정)',
        note: '서울 06:55 도착 예상 · 실제 예약 시간으로 교체하세요',
        imageUrl: '',
        placeMapsUrl: ''
      }
    ]
  }
];
