/** 호핑·마사지·주의사항 기본 콘텐츠 (guideSections) */

export const DEFAULT_HOPPING = {
  items: [
    {
      id: 'hop-photos',
      kind: 'gallery',
      title: '호핑 사진',
      images: [
        { url: './images/tanjung-aru-islands.jpg', caption: '탄중아루에서 본 툰쿠 압둘 라만 제도', wide: true },
        { url: './images/manukan-beach.jpg', caption: '마누칸 해변' },
        { url: './images/manukan-view.jpg', caption: '마누칸 전망' },
        { url: './images/manukan-jetty.jpg', caption: '마누칸 선착장' },
        { url: './images/kk-islands.jpg', caption: '마누칸·마무틱·수룩' },
        { url: './images/mamutik-sulug.jpg', caption: '섬 호핑 전경' },
        { url: './images/kk-sea-activity.jpg', caption: '해상 액티비티' },
        { url: './images/kk-jetski.jpg', caption: '해양 액티비티' }
      ]
    },
    {
      id: 'islands-overview',
      title: '섬 한눈에 보기',
      body: '· 사피 — 스노클링·물놀이, 사람 많음\n· 마누칸 — 해변·사진·산책, 패러/씨워킹\n· 마무틱 — 작은 섬·스노클링, 성게·아쿠아슈즈\n· 집결: Jesselton Quay 뒤 South Jetty (옛 Jesselton Point, 2026.3 이전)\n· 라사 리아 → 제티 45~60분 · 아침 일찍 픽업'
    },
    {
      id: 'book-local',
      tag: '추천',
      tagTone: 'ok',
      title: '예약 방법 A · 현지 흥정 (가성비 최고)',
      body: '한국 앱보다 보통 훨씬 저렴. 호핑 하루 전 선착장 부스를 비교하며 예약하세요.\n\n1. 목적 정하기 — 섬 개수 / 스노클 장비 / 씨워킹·패러 개수\n2. 시세 숙지 — 구성에 따라 대략 1인 MYR 150~230대. 첫 부르는 값은 정가\n3. 부스 2~3곳 비교 — 8~11번대 부스가 자주 언급됨\n4. 포함 확인 — Terminal fee, 구명조끼, 스노클 장비, 섬 입장료(약 MYR 25/인 별도인 경우 많음), 액티비티\n5. 영수증 더블체크 — 섬 이름·포함 항목·담당자 연락처. 당일 지참',
      mapsUrl: 'https://www.google.com/maps/search/?api=1&query=Jesselton+Quay+South+Jetty+Kota+Kinabalu',
      mapsLabel: '선착장 지도',
      links: [
        { url: 'https://travel.rose1538.com/2025/04/Kota-Kinabalu-Jesselton-Point-Firefly--Island-Tour--Booking-Review.html', label: '현장예약 후기', tone: 'review' },
        { url: 'https://whitecow1029.com/3930', label: '흥정 팁', tone: 'soft' }
      ]
    },
    {
      id: 'book-online',
      tag: '편함',
      title: '예약 방법 B · 한국/온라인 사전예약',
      body: '흥정이 부담되면 KKday · 클룩 · 트립닷컴에서 “코타키나발루 호핑” 검색.\n가격은 현지보다 비싼 편이지만 한국어·픽업 포함 상품이 있습니다.\n주의: 라사 리아 같은 외곽 리조트는 pickup zone 외/추가요금인 경우가 많으니 상품 설명을 꼭 확인하세요.',
      links: [
        { url: 'https://www.kkday.com/ko/category/kota-kinabalu', label: 'KKday' },
        { url: 'https://www.klook.com/ko/city/79-kota-kinabalu-things-to-do/', label: '클룩', tone: 'soft' },
        { url: 'https://kr.trip.com/travel-guide/attraction/kota-kinabalu-583/', label: '트립닷컴', tone: 'soft' }
      ]
    },
    {
      id: 'day-flow',
      title: '당일 동선 팁 (라사 리아 기준)',
      body: '전날 예약 → 아침 일찍 차량으로 South Jetty → 영수증 제시 후 보트 → 섬 1~2곳 + 액티비티 → 오후 시내 저녁·마사지.\n액티비티가 많으면 섬은 1~2곳이 여유롭습니다. 점심 미포함이면 컵라면·간식 추천.'
    },
    {
      id: 'blog-links',
      title: '블로거·후기 연계',
      body: '',
      links: [
        { url: 'https://www.sabahparks.org.my/tunku-abdul-rahman-park/', label: 'Sabah Parks 공식', note: '섬 구성·공원 안내' },
        { url: 'https://travel.rose1538.com/2025/04/Kota-Kinabalu-Jesselton-Point-Firefly--Island-Tour--Booking-Review.html', label: '제셀톤 현장 예약 상세', note: 'rose1538 · 흥정·영수증 체크' },
        { url: 'https://travel.rose1538.com/2025/07/Kota-Kinabalu-Island-Tour-Review.html', label: '마무틱 & 마누칸 당일 후기', note: 'rose1538 · 대기·섬 분위기' },
        { url: 'https://whitecow1029.com/3930', label: '섬2 + 스노클 흥정 실전', note: 'whitecow · 포함 항목 팁' },
        { url: 'https://stedi.tistory.com/554632', label: '부스별 흥정 과정', note: 'stedi · 8~11번 부스' },
        { url: 'https://nowonetip.com/150', label: '사피·마누칸 8월 후기', note: 'nowonetip · 우기/건기' },
        { url: 'https://dalmoo.co.kr/%ec%bd%94%ed%83%80%ed%82%a4%eb%82%98%eb%b0%9c%eb%a3%a8-%ec%82%ac%ed%94%bc%ec%84%ac-%eb%a7%88%eb%88%84%ec%b9%b8%ec%84%ac-%ed%98%b8%ed%95%91%ed%88%ac%ec%96%b4-%ea%b0%80%ea%b2%a9-%ed%8c%81/', label: '가격·팁 총정리', note: 'dalmoo · 성게·액티비티' },
        { url: 'https://donotworry.co.kr/23', label: '호핑 + 마사지 하루 코스', note: 'donotworry · Day3 패턴' },
        { url: 'https://nadragon.tistory.com/178', label: '패러·씨워킹 포함 후기', note: 'nadragon · 액티비티 실전' },
        { url: 'https://www.amazingborneo.com/travel/jesselton-point-ferry-terminal-has-moved-what-travellers-to-kota-kinabalu-need-to-know', label: '선착장 이전 안내', note: 'Amazing Borneo · South Jetty' }
      ]
    },
    {
      id: 'photo-credit',
      kind: 'credit',
      title: '사진 출처',
      body: '호핑 사진: Wikimedia Commons · Unsplash. 가격은 시기·흥정·구성에 따라 달라집니다.'
    }
  ]
};

export const DEFAULT_MASSAGE = {
  items: [
    {
      id: 'price-guide',
      tag: '시세 한눈에',
      tagTone: 'ok',
      title: '대략 요금대 (1인)',
      body: '· 발 마사지 60분: 약 MYR 45~70\n· 전신/오일 마사지 60분: 약 MYR 60~120\n· 90분~패키지: 약 MYR 90~160\n· 호텔/프리미엄 스파: MYR 150~300+\n팁은 필수는 아니지만 MYR 5~10 정도 주는 경우 많음'
    },
    {
      id: 'sunset-kinabalu',
      tag: '가성비 · 노을뷰',
      tagTone: 'ok',
      title: 'Sunset Kinabalu Massage · Warisan Square',
      body: '워터프론트·Warisan Square 인근. 석양 보면서 받기 좋다는 후기 많음.\n참고 요금: 발 마사지 60분 MYR 45 · 아로마 바디 60분 MYR 60 · 90분 MYR 90대\n오일+발 콤보·핫스톤 등 패키지 있음. 온라인 예약 가능',
      mapsUrl: 'https://www.google.com/maps/search/?api=1&query=Sunset+Kinabalu+Massage+Warisan+Square',
      siteUrl: 'https://sunsetkinabalumassage.com/',
      reviewUrl: 'https://www.google.com/maps/search/?api=1&query=Sunset+Kinabalu+Massage+reviews'
    },
    {
      id: 'chillax',
      tag: '추천 · 심야',
      tagTone: 'ok',
      title: 'Chillax Herbal Massage · Warisan Square',
      body: 'Warisan Square A1-05. 매일 10:00~03:00로 호핑 늦게 끝나도 가기 좋음.\n참고 요금: 발 리플렉솔로지 60분 MYR 68 · 아로마 바디 60분 MYR 78\n핫스톤 60분 MYR 118 · 바디+발 패키지 MYR 125~148대\n시내 호텔 픽업/드롭 안내하는 경우 있음(조건 확인)',
      mapsUrl: 'https://www.google.com/maps/search/?api=1&query=Chillax+Herbal+Massage+Warisan+Square',
      siteUrl: 'https://chillaxherbalmassage.com/',
      reviewUrl: 'https://www.google.com/maps/search/?api=1&query=Chillax+Herbal+Massage+Kota+Kinabalu'
    },
    {
      id: 'kamaa',
      tag: '시내 스테디',
      title: 'Kama\'A Spa · Asia City',
      body: '아시아 시티(해산물 식당 일대) 3층. 오래전부터 여행객에게 익숙한 스파.\n프로모션에 따라 패키지 MYR 188대부터 시작하는 경우 많음.\nDay3 웰컴/쌍천 씨푸드 식사 후 이동하기 편리',
      mapsUrl: 'https://www.google.com/maps/search/?api=1&query=Kama%27A+Spa+Asia+City+Kota+Kinabalu',
      siteUrl: 'https://kama.com.my/'
    },
    {
      id: 'uluulu',
      tag: '프리미엄',
      title: 'Ulu Ulu Spa · 시내',
      body: '사바 전통 느낌의 시그니처 마사지. 가격대는 시내 일반샵보다 높음.\n참고: 시그니처 바디 60분 MYR 158 / 90분 MYR 188 / 120분 MYR 238\n특별 케어·기념일 분위기를 원할 때',
      mapsUrl: 'https://www.google.com/maps/search/?api=1&query=Ulu+Ulu+Spa+Kota+Kinabalu',
      linkUrl: 'https://www.uluuluspa.com/massage',
      linkLabel: '요금표'
    },
    {
      id: 'usage-tips',
      tag: '이용 팁',
      tagTone: 'warn',
      title: '예약·복장·이동',
      body: '· 호핑 전에 WhatsApp/전화로 19:30~20:30 슬롯 예약 추천\n· 샤워 가능한지, 오일/드라이 강도(soft/medium/hard) 미리 말하기\n· Warisan Square·Asia City는 그랩으로 이동이 편함\n· 리조트 스파는 편하지만 시내보다 비싸고, 늦은 시간 복귀도 고려'
    }
  ]
};

export const DEFAULT_TIPS = {
  items: [
    {
      id: 'resort-distance',
      title: '1. 리조트가 멀다',
      body: '공항·시내 모두 약 45~60분. Day3 호핑·Day4 시내는 이동 시간을 일정에 반드시 넣으세요. 그랩은 리조트에서 잡히지 않을 때가 있어, 리조트 데스크에 차량을 미리 부탁하는 게 안전합니다.'
    },
    {
      id: 'night-pickup',
      title: '2. 야간 도착 픽업',
      body: '현장 택시 흥정은 야간에 불리합니다. 호텔 리무진 또는 써드파티 프라이빗을 하루 전 예약하고, 항공편 번호(KE5761)·도착 23:35를 알려 주세요. 호텔 리무진은 자정 넘기면 심야 할증(+50%) 가능. Grab은 저렴할 수 있어도 심야 배차가 불확실합니다. 가격 비교는 써드파티 픽업을 보세요.',
      linkUrl: '#third-party-pickup',
      linkLabel: '써드파티 픽업',
      linkOpen: 'resort'
    },
    {
      id: 'weather-mosquito',
      title: '3. 날씨·모기',
      body: '8월 사바는 더운 열대 기후(낮 30°C 전후). 갑작스런 소나기 대비. 반딧불이·맹그로브는 모기가 많으니 기피제 필수.'
    },
    {
      id: 'entry-fx',
      title: '4. 입국·환전',
      body: '한국 여권은 단기 관광 무비자(통상 90일). 귀국 항공권·숙소 정보를 보여 달라는 경우 있음. 공항·시내 환전소 이용 가능. 카드 결제는 리조트·대형몰 위주.'
    },
    {
      id: 'hopping-safety',
      title: '5. 호핑 안전',
      body: '해파리·산호 대비 아쿠아슈즈 추천. 귀중품은 방수팩. 음주 후 스노클링 금지. 자외선이 강해 래시가드가 편합니다.'
    },
    {
      id: 'return-flight-tbd',
      title: '6. 귀국편은 미정',
      body: '가이드에 넣은 KE5762는 추천안입니다. 확정되면 시간·편명을 알려 주시면 일정표를 수정해 드립니다.'
    }
  ]
};
