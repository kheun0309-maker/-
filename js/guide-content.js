/** 여행방 공유 가이드 콘텐츠 (히어로·맛집·대안) — URL 이미지, Storage 없음 */

import {
  doc,
  getDoc,
  setDoc,
  onSnapshot,
  serverTimestamp
} from 'https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js';
import { logTripActivity } from './itinerary-editor.js';
import { normalizeImageUrl, photoBlockHtml, listLocalImages } from './image-url.js';

export { normalizeImageUrl } from './image-url.js';

const SECTIONS = ['hero', 'food', 'alternatives', 'flights', 'resort'];

export const DEFAULT_HERO = {
  slides: [
    { id: 'h1', imageUrl: './images/kk-sunset.jpg', caption: '노을이 질 때마다, 또 가고 싶어진다' },
    { id: 'h2', imageUrl: './images/kk-sunset-2.jpg', caption: '파라솔 아래서 보는 황금빛 수평선' },
    { id: 'h3', imageUrl: './images/kk-sunset-3.jpg', caption: '야자수 사이로 스며드는 보라빛 저녁' },
    { id: 'h4', imageUrl: './images/kk-sunset-4.jpg', caption: '바다가 불을 켜는 순간' },
    { id: 'h5', imageUrl: './images/kk-sunset-5.jpg', caption: '보트를 타고 들어가고 싶은 석양' }
  ]
};

export const DEFAULT_FOOD = {
  items: [
    {
      id: 'welcome',
      tag: '해산물 대표',
      name: '웰컴 씨푸드 · Asia City',
      desc: 'KK 대표 해산물집. 수조에서 골라 조리법 지정.\n시그니처: 버터새우, 칠리크랩, 공심채, 계란볶음밥\nAsia City / 힐튼 KK 인근 · 피크타임 대기 많음',
      mapsUrl: 'https://www.google.com/maps/search/?api=1&query=Welcome+Seafood+Restaurant+Asia+City+Kota+Kinabalu',
      siteUrl: 'https://wsr.com.my/en/',
      reviewUrl: 'https://triple.guide/restaurants/c290bf86-92f1-42bf-a80a-fd36250a383a',
      imageUrl: ''
    },
    {
      id: 'suangtain',
      tag: '해산물 대표',
      name: '쌍천 씨푸드 (Suang Tain / 双天)',
      desc: '오징어튀김·드라이버터새우 호평. Sedco Complex / Kampung Air.\n영업 대략 14:30~23:00 · 웰컴과 취향 따라 택1해도 OK',
      mapsUrl: 'https://www.google.com/maps/search/?api=1&query=Suang+Tain+Seafood+Restaurant+Sedco+Complex+Kota+Kinabalu',
      siteUrl: 'https://travel.eundol.com/entry/%EC%BD%94%ED%83%80%ED%82%A4%EB%82%98%EB%B0%9C%EB%A3%A8-%ED%98%84%EC%A7%80-%EB%A7%9B%EC%A7%91-%EC%8C%8D%EC%B2%9C%EC%94%A8%ED%91%B8%EB%93%9C',
      reviewUrl: 'https://travel.rose1538.com/2025/07/Kota-Kinabalu-Seafood-Restaurant-Suangtain-Seafood-review.html',
      imageUrl: ''
    },
    {
      id: 'garden',
      tag: '가성비 씨푸드',
      name: 'KK 가든 씨푸드',
      desc: '현지인·가성비로 자주 추천. 블랙페퍼크랩·드라이버터새우·계란볶음밥.',
      mapsUrl: 'https://www.google.com/maps/search/?api=1&query=KK+Garden+Seafood+Restaurant+Kota+Kinabalu',
      reviewUrl: 'https://triple.guide/restaurants/d12628a1-44b7-4238-9134-48a381877c70',
      imageUrl: ''
    },
    {
      id: 'fattkee',
      tag: '로컬',
      name: 'Kedai Kopi Fatt Kee',
      desc: 'Ang’s Hotel 아래 코피티암. 굴소스 치킨윙·호키엔미 유명. 웨이팅 대비.',
      mapsUrl: 'https://www.google.com/maps/search/?api=1&query=Kedai+Kopi+Fatt+Kee+Ang+Hotel+Kota+Kinabalu',
      siteUrl: 'http://www.thanislim.com/2013/06/kota-kinabalu-food-guide-for-tourists.html',
      imageUrl: ''
    },
    {
      id: 'yeefung',
      tag: '로컬',
      name: 'Yee Fung Laksa · 바쿠테',
      desc: '사바식 락사·바쿠테는 시내 골목에서 가볍게. Day4 쇼핑 동선에 끼우기 좋음.\n돼지고기 메뉴는 할랄 여부 확인.',
      mapsUrl: 'https://www.google.com/maps/search/?api=1&query=Yee+Fung+Laksa+Kota+Kinabalu',
      siteUrl: 'https://www.google.com/maps/search/?api=1&query=Bak+Kut+Teh+Kota+Kinabalu',
      imageUrl: ''
    },
    {
      id: 'waterfront',
      tag: '분위기',
      name: '워터프론트 · Jesselton Quay',
      desc: '호핑 후 저녁·야시장 분위기. Day3 마사지 전후와 잘 맞음.',
      mapsUrl: 'https://www.google.com/maps/search/?api=1&query=Jesselton+Quay+Kota+Kinabalu',
      siteUrl: 'https://www.google.com/maps/search/?api=1&query=Filipino+Market+Kota+Kinabalu',
      imageUrl: './images/gaya-market.jpg'
    }
  ]
};

export const DEFAULT_ALTERNATIVES = {
  items: [
    {
      id: 'napzone',
      tag: '가장 추천',
      title: 'A. 공항 캡슐호텔 — Napzone KKIA by Sovotel',
      desc: 'KKIA Terminal 1 안(랜드사이드) 캡슐. 샤워·수건·락커·짧은 시간 이용(수 시간 단위) 가능.\n시내/리조트에서 저녁 보내고 21:00~22:00경 공항 이동 → 캡슐에서 2~4시간 수면 → 체크인이 현실적인 루트입니다.\nBooking/Agoda에서 “Napzone KKIA”로 검색. 남녀 구역·공용 욕실.',
      linkUrl: 'https://www.booking.com/hotel/my/napzone-kota-kinabalu.html',
      linkLabel: 'Napzone KKIA 예약 보기',
      imageUrl: './images/kkia-airport.jpg'
    },
    {
      id: 'aeropod',
      tag: '대안',
      title: 'B. 에어로포드(Aeropod) · 공항 인근 호텔 1박',
      desc: '공항에서 차로 수 분 거리의 쇼핑몰·호텔이 붙어 있습니다. Day4 체크아웃 후 시내를 보고, 저녁에 에어로포드로 이동해 짧게 잔 뒤 자정 전후 공항으로 가면 됩니다.\n캐리어를 낮에 맡겨 두기 좋고, 가족·커플에게 캡슐보다 편할 수 있습니다.',
      imageUrl: ''
    },
    {
      id: 'dayuse',
      tag: '가성비',
      title: 'C. 시내 데이유즈 / 늦은 체크아웃 + 공항 직행',
      desc: '시내 호텔에 Day4만 데이유즈(또는 늦은 체크아웃)를 잡고 샤워·짐 정리 후, 밤늦게 공항으로 이동합니다.\n공항 대기실에서 쪽잠도 가능하지만 냉방·소음이 있어 Napzone이 훨씬 낫습니다.',
      imageUrl: ''
    },
    {
      id: 'rasaria',
      tag: '비추천에 가까움',
      title: 'D. 라사 리아에 끝까지 머물기',
      desc: '리조트 → 공항 약 45분 + 야간 도로. 00:35 비행이면 대략 21:30 전후 리조트 출발이 안전한데, 그러면 Day4 시내 일정이 애매해집니다.\n시내를 제대로 보려면 A 또는 B가 동선상 유리합니다.',
      imageUrl: ''
    }
  ]
};

export const DEFAULT_FLIGHTS = {
  items: [
    {
      id: 'outbound',
      tag: '확정',
      tagTone: 'ok',
      title: '가는 편 · KE5761 · 8/13(목)',
      flightNo: 'KE5761',
      dateLabel: '8/13(목)',
      from: 'ICN',
      to: 'BKI',
      departTime: '19:15',
      arriveTime: '23:35',
      body: '직항 약 5시간 20분 · 터미널 ICN T2 → BKI T1\n※ 대한항공 코드셰어(진에어 운항일 가능) · 출국 2.5~3시간 전 공항 도착'
    },
    {
      id: 'return',
      tag: '추천 · 미정',
      tagTone: 'warn',
      title: '오는 편 · KE5762 · 8/17(월) 새벽',
      flightNo: 'KE5762',
      dateLabel: '8/17(월) 새벽',
      from: 'BKI',
      to: 'ICN',
      departTime: '00:35',
      arriveTime: '06:55',
      body: '가는 편 KE5761과 짝이 되는 귀국편이라 가장 무난합니다.\n※ 스케줄은 성수기·요일에 따라 변동될 수 있어요. 예약 전 대한항공·진에어에서 꼭 재확인하세요.\n※ 대안: KE5788 (BKI 23:55 → ICN 06:05)'
    }
  ]
};

export const DEFAULT_RESORT = {
  items: [
    {
      id: 'hotel',
      tag: '',
      title: 'Shangri-La Rasa Ria, Kota Kinabalu',
      body: 'Pantai Dalit, Tuaran, Sabah 89208\n전화 +60 88-797-888\n시내·공항에서 차로 약 45분 · 투아란(Tuaran) 쪽 해변 리조트라 시내와 꽤 멉니다.',
      siteUrl: 'https://www.shangri-la.com/kotakinabalu/rasariaresort/',
      mapsUrl: 'https://www.google.com/maps/search/?api=1&query=Shangri-La+Rasa+Ria+Kota+Kinabalu',
      imageUrl: ''
    },
    {
      id: 'airport-pickup',
      tag: 'Day1 핵심',
      title: '공항 → 픽업 미팅까지 가는 법',
      body: 'KE5761 23:35 도착이면 야간이라 사전 픽업(호텔 리무진/프라이빗)을 강력 추천합니다. 리조트까지 약 45~50분.\n\n1. 하기 · 입국심사 — BKI T1. MDAC(디지털 입국신고)는 한국에서 미리. 여권·숙소·귀국편 준비\n2. 수하물 — Baggage Claim에서 캐리어 수령 (보통 벨트 1~2)\n3. 도착홀(Arrivals)로 나오기 — 수하물 뒤 출구를 나오면 미팅 존. 유심·환전 부스가 보임\n4. 피켓 찾기 — Shangri-La / Rasa Ria 또는 이름 피켓을 든 직원을 찾음. 호텔·써드파티 픽업 모두 보통 여기\n5. 못 찾으면 바로 전화 — 리조트 +60 88-797-888 (공식 안내). 바우처에 적힌 기사 번호도 확인\n6. 차량 탑승 — 직원이 주차장/픽업 차까지 안내. 짐 확인 후 출발 → 라사 리아 약 45분\n\n그랩을 쓸 때: 한국에서 Grab 앱·카드 등록. 도착홀 밖으로 나온 뒤 호출하고, 앱에 표시된 Gate(출구) 번호를 지정한 뒤 기사에게 메시지로 기둥/게이트 번호를 보내면 엇갈림이 줄어듭니다. 라사 리아까지는 시내보다 멀어 요금이 더 나오고, 심야엔 배차가 늦을 수 있어요.\n공항 택시: 입국장 밖 택시 카운터 정찰제(선불). 바가지보다 안전하지만 그랩보다 비싼 편.',
      imageUrl: ''
    },
    {
      id: 'limousine',
      tag: '',
      title: '호텔 리무진 요금 · 예약 (공식)',
      body: '· 예약: 객실 예약 시 항공편 입력, 또는 리조트에 최소 하루 전 연락\n· 미팅: 도착 터미널(도착홀)에서 직원이 대기 — 공식 안내\n· Innova MYR 230 · Van MYR 250 · Alphard MYR 290 · Mercedes MYR 470 (세금 포함, 참고)\n· 심야 할증 00:00~06:00 +50% · 23:35 도착 후 자정 넘기면 할증 가능\n· 예약 4시간 이내 취소 시 100% 위약금',
      mapsUrl: 'https://www.google.com/maps/dir/?api=1&origin=Kota+Kinabalu+International+Airport&destination=Shangri-La+Rasa+Ria,+Kota+Kinabalu&travelmode=driving',
      links: [
        { url: 'https://www.shangri-la.com/kotakinabalu/rasariaresort/about/map-directions/hotel-limousine/', label: '리무진 요금표' },
        { url: 'https://www.shangri-la.com/kr/kotakinabalu/rasariaresort/about/map-directions/', label: '오시는 길(한글)', tone: 'soft' }
      ],
      imageUrl: ''
    },
    {
      id: 'third-party-pickup',
      tag: '써드파티',
      title: '공항 → 라사 리아 · 써드파티 픽업 (가격 참고)',
      body: '호텔 리무진 말고도 현지 투어사·OTA·Grab으로 공항↔숙소 이동을 예약할 수 있습니다. 편도 약 45~55분. 아래는 차량 1대 편도 기준 참고가이며, 인원·짐·야간할증·시기에 따라 달라집니다.\n\n· 현지 투어사 프라이빗 (예: TYH Borneo Tours)\n  · 밴(라사 리아 등 외곽): MYR 250 / 편도\n  · Alphard·Vellfire: MYR 350 / 편도\n  · 도착홀 피켓 미팅 · 항공편 입력 필수 · 대기 약 1시간 안내\n\n· KKday · Pelago 등 OTA\n  · 라사 리아(투아란) 프라이빗: 대략 MYR 120~160대 안내가 많음\n  · 야간(대략 20:00~08:00) 할증·차종에 따라 더 비쌀 수 있음\n  · 한국어 앱·바우처로 예약하기 편함 · 숙소명에 Shangri-La Rasa Ria / Tuaran 확인\n\n· Grab (앱 호출)\n  · 공항→라사 리아: 대략 MYR 60~80 (앱 표시 요금 · 성수기·심야 할증 가능)\n  · 사전 예약이 아니라 도착 후 호출 · 23:35 도착 심야는 배차·대기 불확실\n  · 한국에서 앱·결제 수단 미리 등록 · Gate(출구) 번호 지정\n\n· 공항 쿠폰 택시\n  · 시내·근거리용 정찰제 · 라사 리아(외곽)는 사실상 비권장\n\n한눈에 비교 (편도·참고)\nGrab MYR 60~80 · OTA 프라이빗 MYR 120~160대 · 현지 투어사 밴 MYR 250 · 호텔 Innova MYR 230 (심야 00:00~06:00 +50% → 약 MYR 345)\nKE5761 야간 도착이면 써드파티/호텔 사전 픽업이 Grab보다 마음이 편합니다. 귀국(리조트→공항)도 같은 요금대를 편도로 잡으면 됩니다.',
      links: [
        { url: 'https://www.tyhborneotours.com/Kota-Kinabalu-Airport-Transfer', label: 'TYH 공항 트랜스퍼' },
        { url: 'https://www.kkday.com/ko/productlist/product?keyword=Kota%20Kinabalu%20Airport%20Transfer', label: 'KKday 공항 픽업 검색', tone: 'soft' },
        { url: 'https://www.pelago.com/en/activity/p7zyliydu-private-transfer-kota-kinabalu-international-airport-to-from-hotel-kota-kinabalu/', label: 'Pelago 프라이빗', tone: 'soft' },
        { url: 'https://www.grab.com/my/transport/', label: 'Grab 안내', tone: 'review' }
      ],
      imageUrl: ''
    },
    {
      id: 'resort-shuttle',
      tag: '시내 이동',
      title: '리조트 셔틀버스 시간표',
      body: '라사 리아 ↔ 시내(제셀톤 · 이마고몰 코스) 셔틀이 하루 몇 회 운행합니다.\n· 타기 전 프론트 예약 필수 · 정원 약 40명(만석이면 탑승 불가)\n· 후기 기준: 낮 출발 → 저녁 이마고몰 막차(약 19:30)로 복귀하는 경우가 많음\n· 야시장 등으로 늦으면 그랩(시내↔리조트 약 MYR 45~50 참고)',
      imageUrl: './images/rasa-ria-shuttle.jpg',
      imageFit: 'contain',
      imageCaption: '시간표 사진 출처: mestone 블로그 · 현장 스케줄은 변경될 수 있으니 프론트에서 한번 더 확인하세요.',
      linkUrl: 'https://mestone.tistory.com/entry/%EC%BD%94%ED%83%80%ED%82%A4%EB%82%98%EB%B0%9C%EB%A3%A8-%EC%86%8C%EC%86%8C%ED%95%9C-%EC%97%AC%ED%96%89-%EC%83%B9%EA%B7%B8%EB%A6%B4%EB%9D%BC-%EB%9D%BC%EC%82%AC%EB%A6%AC%EC%95%84feat%EC%9D%B4%EB%8F%99',
      linkLabel: '원문 보기'
    },
    {
      id: 'blog-links',
      tag: '',
      title: '공항·픽업 관련 블로거 / 가이드',
      body: '',
      links: [
        {
          url: 'https://www.tripstore.kr/blog/%EC%BD%94%ED%83%80%ED%82%A4%EB%82%98%EB%B0%9C%EB%A3%A8-%EA%B3%B5%ED%95%AD-%EC%8B%9C%EB%82%B4%EC%9D%B4%EB%8F%99-%EC%9E%85%EA%B5%AD-%EA%BF%80%ED%8C%81',
          label: '공항 완벽 정리 · 이동 3가지',
          note: '트립스토어 · 그랩 Gate 지정·픽업·택시 비교'
        },
        {
          url: 'https://ribotour.tistory.com/entry/%EB%A7%90%EB%A0%88%EC%9D%B4%EC%8B%9C%EC%95%84-%EC%BD%94%ED%83%80%ED%82%A4%EB%82%98%EB%B0%9C%EB%A3%A8-%EA%B5%AD%EC%A0%9C%EA%B3%B5%ED%95%AD-%EC%99%84%EC%A0%84-%EC%A0%95%EB%B3%B5',
          label: 'KKIA 도착 후 1시간 동선',
          note: 'ribotour · 입국·수하물·유심·환전·Grab'
        },
        {
          url: 'https://lyntour.com/posts/malaysia-kota-kinabalu-airport-grab-taxi-guide',
          label: '공항 그랩 사용법·후기',
          note: 'Lyntour · 앱 설치부터 픽업까지'
        },
        {
          url: 'https://ineffable-hj.tistory.com/38',
          label: '공항 환전·유심·그랩 가입',
          note: '김지블 · 도착 직후 실전 순서'
        },
        {
          url: 'https://m.blog.naver.com/art_food_travel/223547908394',
          label: '라사 리아 · 공항→리조트 이동',
          note: '네이버 블로그 · 약 50분·써드파티 픽업 경험'
        },
        {
          url: 'https://mestone.tistory.com/entry/%EC%BD%94%ED%83%80%ED%82%A4%EB%82%98%EB%B0%9C%EB%A3%A8-%EC%86%8C%EC%86%8C%ED%95%9C-%EC%97%AC%ED%96%89-%EC%83%B9%EA%B7%B8%EB%A6%B4%EB%9D%BC-%EB%9D%BC%EC%82%AC%EB%A6%AC%EC%95%84feat%EC%9D%B4%EB%8F%99',
          label: '라사 리아 이동·그랩 요금',
          note: 'mestone · 공항/시내↔리조트 · 셔틀 참고'
        },
        {
          url: 'https://lovely-days.co.kr/4691',
          label: '공항 픽업/드랍 비용 정리',
          note: 'lovely-days · 심야 픽업 선택 팁'
        }
      ],
      imageUrl: ''
    },
    {
      id: 'return-transfer',
      tag: '',
      title: '귀국 시 공항 이동',
      body: 'KE5762(00:35) 기준이면 16일 저녁에 시내를 보고, 밤늦게 리조트 또는 공항 인근에서 대기 후 이동하는 동선이 됩니다.\n리조트 → 공항도 약 45분 + 여유 포함해 출발 3시간 전 공항 도착을 목표로 리무진/그랩을 잡아 두세요.',
      imageUrl: ''
    }
  ]
};

let ctx = null;
let unsub = null;
let heroTimer = null;
let heroIndex = 0;

function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

let state = {
  hero: deepClone(DEFAULT_HERO),
  food: deepClone(DEFAULT_FOOD),
  alternatives: deepClone(DEFAULT_ALTERNATIVES),
  flights: deepClone(DEFAULT_FLIGHTS),
  resort: deepClone(DEFAULT_RESORT)
};

function esc(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** 줄바꿈 + http(s) URL을 새 탭 링크로 (HTML 이스케이프 포함) */
export function formatRichText(text) {
  const source = String(text || '');
  if (!source) return '';
  const urlRe = /(https?:\/\/[^\s<>"'`]+)/gi;
  let last = 0;
  let match;
  const parts = [];
  const pushText = (chunk) => {
    if (!chunk) return;
    parts.push(esc(chunk).replace(/\n/g, '<br>'));
  };
  while ((match = urlRe.exec(source)) !== null) {
    pushText(source.slice(last, match.index));
    let href = match[1].replace(/[),.;!?…」』]+$/g, '');
    const trailing = match[1].slice(href.length);
    try {
      const parsed = new URL(href);
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
        parts.push(
          `<a class="rich-link" href="${esc(parsed.href)}" target="_blank" rel="noopener noreferrer">${esc(href)}</a>`
        );
        if (trailing) pushText(trailing);
      } else {
        pushText(match[1]);
      }
    } catch (_) {
      pushText(match[1]);
    }
    last = match.index + match[1].length;
  }
  pushText(source.slice(last));
  return parts.join('');
}

function nl2br(s) {
  return formatRichText(s);
}

function cloneDefaults() {
  return {
    hero: deepClone(DEFAULT_HERO),
    food: deepClone(DEFAULT_FOOD),
    alternatives: deepClone(DEFAULT_ALTERNATIVES),
    flights: deepClone(DEFAULT_FLIGHTS),
    resort: deepClone(DEFAULT_RESORT)
  };
}

function canEdit() {
  return Boolean(ctx?.db && ctx?.tripCode && ctx?.nickname);
}

function sectionRef(section) {
  return doc(ctx.db, 'trips', ctx.tripCode, 'guideSections', section);
}

function stopHeroTimer() {
  if (heroTimer) {
    clearInterval(heroTimer);
    heroTimer = null;
  }
}

function renderHero() {
  const wrap = document.getElementById('heroSlides');
  const dotsWrap = document.getElementById('heroDots');
  const caption = document.getElementById('heroCaption');
  if (!wrap) return;

  const slides = (state.hero?.slides || []).filter(s => s?.imageUrl).slice(0, 8);
  const list = slides.length ? slides : DEFAULT_HERO.slides;

  stopHeroTimer();
  wrap.innerHTML = list.map((s, i) => (
    `<div class="hero-slide${i === 0 ? ' is-active' : ''}" style="background-image:url('${esc(s.imageUrl)}')"></div>`
  )).join('');

  if (dotsWrap) {
    dotsWrap.innerHTML = list.map((_, i) => (
      `<span class="${i === 0 ? 'is-on' : ''}"></span>`
    )).join('');
  }

  heroIndex = 0;
  if (caption) caption.textContent = list[0]?.caption || '';

  const slideEls = Array.from(wrap.querySelectorAll('.hero-slide'));
  const dots = dotsWrap ? Array.from(dotsWrap.children) : [];
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (slideEls.length < 2 || reduceMotion) return;

  list.slice(1).forEach(s => {
    const img = new Image();
    img.src = s.imageUrl;
  });

  const show = (next) => {
    slideEls[heroIndex]?.classList.remove('is-active');
    dots[heroIndex]?.classList.remove('is-on');
    heroIndex = next;
    slideEls[heroIndex]?.classList.add('is-active');
    dots[heroIndex]?.classList.add('is-on');
    if (caption) {
      caption.style.opacity = '0';
      caption.style.transform = 'translateY(6px)';
      caption.style.transition = 'opacity 0.35s ease, transform 0.35s ease';
      setTimeout(() => {
        caption.textContent = list[heroIndex]?.caption || '';
        caption.style.opacity = '1';
        caption.style.transform = 'none';
      }, 220);
    }
  };

  heroTimer = setInterval(() => show((heroIndex + 1) % slideEls.length), 4500);
}

function renderFood() {
  const root = document.getElementById('foodEditable');
  if (!root) return;
  const items = state.food?.items || [];
  root.innerHTML = items.map(it => {
    const links = [];
    if (it.mapsUrl) links.push(`<a href="${esc(it.mapsUrl)}" target="_blank" rel="noopener">구글지도</a>`);
    if (it.siteUrl) links.push(`<a class="soft" href="${esc(it.siteUrl)}" target="_blank" rel="noopener">사이트</a>`);
    if (it.reviewUrl) links.push(`<a class="review" href="${esc(it.reviewUrl)}" target="_blank" rel="noopener">후기</a>`);
    const photo = photoBlockHtml(it.imageUrl, it.name || '');
    return `
      <div class="info-card" data-food-id="${esc(it.id)}">
        ${photo}
        ${it.tag ? `<span class="tag ok">${esc(it.tag)}</span>` : ''}
        <b>${esc(it.name)}</b>
        <p>${nl2br(it.desc)}</p>
        ${links.length ? `<div class="food-actions">${links.join('')}</div>` : ''}
        ${canEdit() ? `<div class="tiny" style="margin-top:6px;opacity:.65">id: ${esc(it.id)}</div>` : ''}
      </div>`;
  }).join('');
}

function renderAlternatives() {
  const root = document.getElementById('altEditable');
  if (!root) return;
  const items = state.alternatives?.items || [];
  root.innerHTML = items.map(it => {
    const photo = photoBlockHtml(it.imageUrl, it.title || '');
    const link = it.linkUrl
      ? `<a class="link-btn" href="${esc(it.linkUrl)}" target="_blank" rel="noopener">${esc(it.linkLabel || '링크 열기')}</a>`
      : '';
    return `
      <div class="option-card" data-alt-id="${esc(it.id)}">
        ${photo}
        ${it.tag ? `<span class="tag">${esc(it.tag)}</span>` : ''}
        <h3>${esc(it.title)}</h3>
        <p>${nl2br(it.desc)}</p>
        ${link}
        ${canEdit() ? `<div class="tiny" style="margin-top:6px;opacity:.65">id: ${esc(it.id)}</div>` : ''}
      </div>`;
  }).join('');
}

function renderFlights() {
  const root = document.getElementById('flightsEditable');
  if (!root) return;
  const items = state.flights?.items || [];
  root.innerHTML = items.map(it => {
    const tone = it.tagTone === 'warn' ? 'warn' : 'ok';
    const route = `${esc(it.from || '')} ${esc(it.departTime || '')} 출발 → ${esc(it.to || '')} ${esc(it.arriveTime || '')} 도착`;
    return `
      <div class="flight-item" data-flight-id="${esc(it.id)}">
        ${it.tag ? `<span class="tag ${tone}">${esc(it.tag)}</span>` : ''}
        <b>${esc(it.title)}</b>
        <span>
          ${route}<br>
          ${nl2br(it.body || '')}
        </span>
        ${canEdit() ? `<div class="tiny" style="margin-top:6px;opacity:.65">id: ${esc(it.id)}</div>` : ''}
      </div>`;
  }).join('');
}

function normalizeResortLinks(links) {
  if (!Array.isArray(links)) return [];
  return links.slice(0, 16).map(l => ({
    url: String(l?.url || '').trim().slice(0, 500),
    label: String(l?.label || '').slice(0, 80),
    note: String(l?.note || '').slice(0, 120),
    tone: ['soft', 'review'].includes(l?.tone) ? l.tone : ''
  })).filter(l => l.url && l.label);
}

function renderResortPhoto(it) {
  if (!it.imageUrl) return '';
  if (it.imageFit === 'contain') {
    return `
      <div class="day-photo" style="aspect-ratio:auto;max-height:none">
        <img src="${esc(it.imageUrl)}" alt="${esc(it.title || '')}" loading="lazy"
          style="height:auto;object-fit:contain;background:#fff"
          onerror="this.style.display='none'">
      </div>
      ${it.imageCaption ? `<p class="photo-credit">${esc(it.imageCaption)}</p>` : ''}`;
  }
  const photo = photoBlockHtml(it.imageUrl, it.title || '');
  const credit = it.imageCaption ? `<p class="photo-credit">${esc(it.imageCaption)}</p>` : '';
  return `${photo}${credit}`;
}

function renderResortLinks(it) {
  const actionLinks = [];
  if (it.mapsUrl) {
    actionLinks.push(`<a href="${esc(it.mapsUrl)}" target="_blank" rel="noopener">구글지도</a>`);
  }
  if (it.siteUrl) {
    actionLinks.push(`<a class="soft" href="${esc(it.siteUrl)}" target="_blank" rel="noopener">사이트</a>`);
  }
  if (it.linkUrl) {
    actionLinks.push(`<a class="soft" href="${esc(it.linkUrl)}" target="_blank" rel="noopener">${esc(it.linkLabel || '링크 열기')}</a>`);
  }
  const multi = Array.isArray(it.links) ? it.links : [];
  const noted = multi.filter(l => l.note);
  const plain = multi.filter(l => !l.note);
  for (const l of plain) {
    const cls = l.tone ? ` class="${esc(l.tone)}"` : '';
    actionLinks.push(`<a${cls} href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.label)}</a>`);
  }
  const actions = actionLinks.length
    ? `<div class="food-actions">${actionLinks.join('')}</div>`
    : '';
  const list = noted.length
    ? `<ul class="link-list" style="margin-top:8px">${noted.map(l => `
        <li>
          <a href="${esc(l.url)}" target="_blank" rel="noopener">
            <strong>${esc(l.label)}</strong>
            <span>${esc(l.note)}</span>
          </a>
        </li>`).join('')}</ul>`
    : '';
  return `${list}${actions}`;
}

function renderResort() {
  const root = document.getElementById('resortEditable');
  if (!root) return;
  const items = state.resort?.items || [];
  root.innerHTML = items.map(it => {
    const photo = renderResortPhoto(it);
    const links = renderResortLinks(it);
    const body = it.body ? `<p>${nl2br(it.body)}</p>` : '';
    return `
      <div class="info-card" id="${esc(it.id)}" data-resort-id="${esc(it.id)}">
        ${photo}
        ${it.tag ? `<span class="tag ok">${esc(it.tag)}</span>` : ''}
        <b>${esc(it.title)}</b>
        ${body}
        ${links}
        ${canEdit() ? `<div class="tiny" style="margin-top:6px;opacity:.65">id: ${esc(it.id)}</div>` : ''}
      </div>`;
  }).join('');
}

function renderAll() {
  renderHero();
  renderFood();
  renderAlternatives();
  renderFlights();
  renderResort();
}

function normalizeHero(data) {
  const slides = Array.isArray(data?.slides) ? data.slides : [];
  return {
    slides: slides.slice(0, 8).map((s, i) => ({
      id: String(s.id || `h${i + 1}`).slice(0, 40),
      imageUrl: normalizeImageUrl(s.imageUrl),
      caption: String(s.caption || '').slice(0, 80)
    })).filter(s => s.imageUrl)
  };
}

function normalizeFood(data) {
  const items = Array.isArray(data?.items) ? data.items : [];
  return {
    items: items.slice(0, 20).map((it, i) => ({
      id: String(it.id || `food${i + 1}`).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40) || `food${i + 1}`,
      tag: String(it.tag || '').slice(0, 40),
      name: String(it.name || '').slice(0, 80),
      desc: String(it.desc || '').slice(0, 600),
      mapsUrl: String(it.mapsUrl || '').trim().slice(0, 500),
      siteUrl: String(it.siteUrl || '').trim().slice(0, 500),
      reviewUrl: String(it.reviewUrl || '').trim().slice(0, 500),
      imageUrl: normalizeImageUrl(it.imageUrl)
    })).filter(it => it.name)
  };
}

function normalizeAlts(data) {
  const items = Array.isArray(data?.items) ? data.items : [];
  return {
    items: items.slice(0, 12).map((it, i) => ({
      id: String(it.id || `alt${i + 1}`).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40) || `alt${i + 1}`,
      tag: String(it.tag || '').slice(0, 40),
      title: String(it.title || '').slice(0, 100),
      desc: String(it.desc || '').slice(0, 700),
      linkUrl: String(it.linkUrl || '').trim().slice(0, 500),
      linkLabel: String(it.linkLabel || '').slice(0, 40),
      imageUrl: normalizeImageUrl(it.imageUrl)
    })).filter(it => it.title)
  };
}

function normalizeFlights(data) {
  const items = Array.isArray(data?.items) ? data.items : [];
  return {
    items: items.slice(0, 8).map((it, i) => ({
      id: String(it.id || `flight${i + 1}`).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40) || `flight${i + 1}`,
      tag: String(it.tag || '').slice(0, 40),
      tagTone: it.tagTone === 'warn' ? 'warn' : 'ok',
      title: String(it.title || '').slice(0, 100),
      flightNo: String(it.flightNo || '').slice(0, 20),
      dateLabel: String(it.dateLabel || '').slice(0, 40),
      from: String(it.from || '').slice(0, 12),
      to: String(it.to || '').slice(0, 12),
      departTime: String(it.departTime || '').slice(0, 20),
      arriveTime: String(it.arriveTime || '').slice(0, 20),
      body: String(it.body || it.desc || '').slice(0, 800)
    })).filter(it => it.title || it.flightNo)
  };
}

function normalizeResort(data) {
  const items = Array.isArray(data?.items) ? data.items : [];
  return {
    items: items.slice(0, 20).map((it, i) => ({
      id: String(it.id || `resort${i + 1}`).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40) || `resort${i + 1}`,
      tag: String(it.tag || '').slice(0, 40),
      title: String(it.title || it.name || '').slice(0, 120),
      body: String(it.body || it.desc || '').slice(0, 2500),
      imageUrl: normalizeImageUrl(it.imageUrl),
      imageFit: it.imageFit === 'contain' ? 'contain' : '',
      imageCaption: String(it.imageCaption || '').slice(0, 200),
      mapsUrl: String(it.mapsUrl || '').trim().slice(0, 500),
      siteUrl: String(it.siteUrl || '').trim().slice(0, 500),
      linkUrl: String(it.linkUrl || '').trim().slice(0, 500),
      linkLabel: String(it.linkLabel || '').slice(0, 40),
      links: normalizeResortLinks(it.links)
    })).filter(it => it.title)
  };
}

function normalizeSectionData(section, data) {
  if (section === 'hero') return normalizeHero(data);
  if (section === 'food') return normalizeFood(data);
  if (section === 'alternatives') return normalizeAlts(data);
  if (section === 'flights') return normalizeFlights(data);
  if (section === 'resort') return normalizeResort(data);
  return data;
}

async function ensureSection(section) {
  const snap = await getDoc(sectionRef(section));
  if (snap.exists()) return snap.data();
  const base = normalizeSectionData(section, state[section] || {});
  const payload = {
    ...base,
    updatedBy: ctx.nickname,
    updatedAt: serverTimestamp()
  };
  await setDoc(sectionRef(section), payload);
  return payload;
}

async function saveSection(section, data, eventMeta = null) {
  if (!canEdit()) throw new Error('여행방에 입장해야 가이드를 수정할 수 있어요.');
  const normalized = normalizeSectionData(section, data);
  if (section === 'hero' && !normalized.slides?.length) {
    throw new Error('히어로 이미지가 최소 1장 필요해요.');
  }
  if (section === 'flights' && !normalized.items?.length) {
    throw new Error('항공 정보가 최소 1개 필요해요.');
  }
  await setDoc(sectionRef(section), {
    ...normalized,
    updatedBy: ctx.nickname,
    updatedAt: serverTimestamp()
  });
  state[section] = normalized;
  renderAll();
  if (eventMeta) {
    await logTripActivity({
      kind: eventMeta.kind || section,
      day: 'guide',
      summary: eventMeta.summary || '가이드 변경',
      detail: eventMeta.detail || '',
      itemId: eventMeta.itemId || ''
    });
  }
  return normalized;
}

function applyFoodPatch(items, proposal) {
  const next = items.map(it => ({ ...it }));
  if (proposal.action === 'add') {
    const id = String(proposal.itemId || `food-${Date.now()}`).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40);
    if (next.some(it => it.id === id)) throw new Error('이미 있는 맛집 id예요.');
    next.push({
      id,
      tag: proposal.tag || '',
      name: proposal.name || '',
      desc: proposal.desc || '',
      mapsUrl: proposal.mapsUrl || '',
      siteUrl: proposal.siteUrl || '',
      reviewUrl: proposal.reviewUrl || '',
      imageUrl: proposal.imageUrl || ''
    });
    return next;
  }
  const idx = next.findIndex(it => it.id === proposal.itemId);
  if (idx < 0) throw new Error('맛집 id를 찾지 못했어요. get_editable_content로 확인하세요.');
  if (proposal.action === 'delete') {
    next.splice(idx, 1);
    return next;
  }
  next[idx] = {
    ...next[idx],
    tag: proposal.tag != null ? proposal.tag : next[idx].tag,
    name: proposal.name != null ? proposal.name : next[idx].name,
    desc: proposal.desc != null ? proposal.desc : next[idx].desc,
    mapsUrl: proposal.mapsUrl != null ? proposal.mapsUrl : next[idx].mapsUrl,
    siteUrl: proposal.siteUrl != null ? proposal.siteUrl : next[idx].siteUrl,
    reviewUrl: proposal.reviewUrl != null ? proposal.reviewUrl : next[idx].reviewUrl,
    imageUrl: proposal.imageUrl != null ? proposal.imageUrl : next[idx].imageUrl
  };
  return next;
}

function applyAltPatch(items, proposal) {
  const next = items.map(it => ({ ...it }));
  if (proposal.action === 'add') {
    const id = String(proposal.itemId || `alt-${Date.now()}`).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40);
    if (next.some(it => it.id === id)) throw new Error('이미 있는 대안 id예요.');
    next.push({
      id,
      tag: proposal.tag || '',
      title: proposal.title || proposal.name || '',
      desc: proposal.desc || '',
      linkUrl: proposal.linkUrl || proposal.mapsUrl || '',
      linkLabel: proposal.linkLabel || '링크 열기',
      imageUrl: proposal.imageUrl || ''
    });
    return next;
  }
  const idx = next.findIndex(it => it.id === proposal.itemId);
  if (idx < 0) throw new Error('대안 id를 찾지 못했어요.');
  if (proposal.action === 'delete') {
    next.splice(idx, 1);
    return next;
  }
  next[idx] = {
    ...next[idx],
    tag: proposal.tag != null ? proposal.tag : next[idx].tag,
    title: proposal.title != null ? proposal.title : (proposal.name != null ? proposal.name : next[idx].title),
    desc: proposal.desc != null ? proposal.desc : next[idx].desc,
    linkUrl: proposal.linkUrl != null ? proposal.linkUrl : (proposal.mapsUrl != null ? proposal.mapsUrl : next[idx].linkUrl),
    linkLabel: proposal.linkLabel != null ? proposal.linkLabel : next[idx].linkLabel,
    imageUrl: proposal.imageUrl != null ? proposal.imageUrl : next[idx].imageUrl
  };
  return next;
}

function applyResortPatch(items, proposal) {
  const next = items.map(it => ({ ...it, links: Array.isArray(it.links) ? it.links.map(l => ({ ...l })) : [] }));
  if (proposal.action === 'add') {
    const id = String(proposal.itemId || `resort-${Date.now()}`).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40);
    if (next.some(it => it.id === id)) throw new Error('이미 있는 숙소 카드 id예요.');
    next.push({
      id,
      tag: proposal.tag || '',
      title: proposal.title || proposal.name || '',
      body: proposal.body || proposal.desc || '',
      imageUrl: proposal.imageUrl || '',
      imageFit: proposal.imageFit === 'contain' ? 'contain' : '',
      imageCaption: proposal.imageCaption || '',
      mapsUrl: proposal.mapsUrl || '',
      siteUrl: proposal.siteUrl || '',
      linkUrl: proposal.linkUrl || '',
      linkLabel: proposal.linkLabel || '링크 열기',
      links: normalizeResortLinks(proposal.links)
    });
    return next;
  }
  const idx = next.findIndex(it => it.id === proposal.itemId);
  if (idx < 0) throw new Error('숙소 카드 id를 찾지 못했어요. get_editable_content(resort)로 확인하세요.');
  if (proposal.action === 'delete') {
    next.splice(idx, 1);
    return next;
  }
  const cur = next[idx];
  next[idx] = {
    ...cur,
    tag: proposal.tag != null ? proposal.tag : cur.tag,
    title: proposal.title != null ? proposal.title : (proposal.name != null ? proposal.name : cur.title),
    body: proposal.body != null || proposal.desc != null ? (proposal.body || proposal.desc) : cur.body,
    imageUrl: proposal.imageUrl != null ? proposal.imageUrl : cur.imageUrl,
    imageFit: proposal.imageFit != null ? (proposal.imageFit === 'contain' ? 'contain' : '') : cur.imageFit,
    imageCaption: proposal.imageCaption != null ? proposal.imageCaption : cur.imageCaption,
    mapsUrl: proposal.mapsUrl != null ? proposal.mapsUrl : cur.mapsUrl,
    siteUrl: proposal.siteUrl != null ? proposal.siteUrl : cur.siteUrl,
    linkUrl: proposal.linkUrl != null ? proposal.linkUrl : cur.linkUrl,
    linkLabel: proposal.linkLabel != null ? proposal.linkLabel : cur.linkLabel,
    links: proposal.links != null ? normalizeResortLinks(proposal.links) : cur.links
  };
  return next;
}

function applyFlightPatch(items, proposal) {
  const next = items.map(it => ({ ...it }));
  const buildTitle = (it) => {
    if (proposal.title) return proposal.title;
    const no = proposal.flightNo != null ? proposal.flightNo : it.flightNo;
    const date = proposal.dateLabel != null ? proposal.dateLabel : it.dateLabel;
    const leg = it.id === 'return' || /return|귀국|오는/i.test(String(no || it.title || ''))
      ? '오는 편'
      : '가는 편';
    if (no || date) return `${leg}${no ? ` · ${no}` : ''}${date ? ` · ${date}` : ''}`;
    return it.title || '항공편';
  };

  if (proposal.action === 'add') {
    const id = String(proposal.itemId || `flight-${Date.now()}`).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40);
    if (next.some(it => it.id === id)) throw new Error('이미 있는 항공 id예요.');
    const draft = {
      id,
      tag: proposal.tag || '',
      tagTone: proposal.tagTone === 'warn' ? 'warn' : 'ok',
      title: '',
      flightNo: proposal.flightNo || '',
      dateLabel: proposal.dateLabel || '',
      from: proposal.from || '',
      to: proposal.to || '',
      departTime: proposal.departTime || '',
      arriveTime: proposal.arriveTime || '',
      body: proposal.body || proposal.desc || ''
    };
    draft.title = buildTitle(draft);
    next.push(draft);
    return next;
  }
  const idx = next.findIndex(it => it.id === proposal.itemId);
  if (idx < 0) throw new Error('항공 id를 찾지 못했어요. outbound|return 등 get_editable_content(flights)로 확인하세요.');
  if (proposal.action === 'delete') {
    next.splice(idx, 1);
    return next;
  }
  const cur = next[idx];
  next[idx] = {
    ...cur,
    tag: proposal.tag != null ? proposal.tag : cur.tag,
    tagTone: proposal.tagTone != null ? (proposal.tagTone === 'warn' ? 'warn' : 'ok') : cur.tagTone,
    flightNo: proposal.flightNo != null ? proposal.flightNo : cur.flightNo,
    dateLabel: proposal.dateLabel != null ? proposal.dateLabel : cur.dateLabel,
    from: proposal.from != null ? proposal.from : cur.from,
    to: proposal.to != null ? proposal.to : cur.to,
    departTime: proposal.departTime != null ? proposal.departTime : cur.departTime,
    arriveTime: proposal.arriveTime != null ? proposal.arriveTime : cur.arriveTime,
    body: proposal.body != null || proposal.desc != null ? (proposal.body || proposal.desc) : cur.body,
    title: proposal.title != null ? proposal.title : buildTitle(cur)
  };
  return next;
}

export function initGuideContentUi() {
  state = cloneDefaults();
  renderAll();
}

export async function attachGuideContentRoom(nextCtx) {
  detachGuideContentRoom({ keepRender: true });
  ctx = nextCtx;
  if (!canEdit()) return;

  const applyRemote = (section, data) => {
    if (section === 'hero') state.hero = normalizeHero(data?.slides ? data : DEFAULT_HERO);
    if (section === 'food') state.food = normalizeFood(data?.items ? data : DEFAULT_FOOD);
    if (section === 'alternatives') state.alternatives = normalizeAlts(data?.items ? data : DEFAULT_ALTERNATIVES);
    if (section === 'flights') state.flights = normalizeFlights(data?.items ? data : DEFAULT_FLIGHTS);
    if (section === 'resort') state.resort = normalizeResort(data?.items ? data : DEFAULT_RESORT);
    renderAll();
  };

  // 섹션별 스냅샷 — 없으면 기본값 유지 (최초 AI 적용 시 생성)
  const unsubs = [];
  for (const section of SECTIONS) {
    unsubs.push(onSnapshot(sectionRef(section), snap => {
      if (!snap.exists()) return;
      applyRemote(section, snap.data());
    }, err => console.warn('guideSections listen failed', section, err)));
  }
  unsub = () => unsubs.forEach(fn => { try { fn(); } catch (_) {} });
}

export function detachGuideContentRoom({ keepRender = false } = {}) {
  if (typeof unsub === 'function') {
    try { unsub(); } catch (_) {}
  }
  unsub = null;
  ctx = null;
  if (!keepRender) {
    state = cloneDefaults();
    renderAll();
  }
}

export function getGuideContentApi() {
  return {
    canEdit: () => canEdit(),
    nickname: () => ctx?.nickname || '',
    tripCode: () => ctx?.tripCode || '',
    getSnapshot() {
      return {
        editable: canEdit(),
        tripCode: ctx?.tripCode || '',
        hero: state.hero,
        food: state.food,
        alternatives: state.alternatives,
        flights: state.flights,
        resort: state.resort,
        localImages: listLocalImages(),
        hint: '숙소·픽업·셔틀은 resort (id: hotel|airport-pickup|limousine|third-party-pickup|resort-shuttle|blog-links|return-transfer). 항공은 flights.outbound / flights.return. 사진 imageUrl은 localImages의 ./images/... 를 우선 사용. 지도·부킹·후기 페이지 URL은 사진으로 쓰지 말 것.'
      };
    },
    async applyProposal(proposal) {
      if (!canEdit()) throw new Error('여행방에 입장해야 적용할 수 있어요.');
      const section = proposal.section;
      if (!SECTIONS.includes(section)) throw new Error('section은 hero|food|alternatives|flights|resort 중 하나여야 해요.');

      await ensureSection(section);
      const act = ({ add: '추가', update: '수정', delete: '삭제' })[proposal.action] || proposal.action;
      const reason = String(proposal.reason || '').slice(0, 120);

      if (section === 'hero') {
        const slides = [...(state.hero.slides || [])];
        let targetId = proposal.itemId || '';
        let label = '';
        if (proposal.action === 'add') {
          if (!proposal.imageUrl) throw new Error('히어로 추가에는 imageUrl이 필요해요.');
          targetId = String(proposal.itemId || `h${Date.now()}`).slice(0, 40);
          label = proposal.caption || proposal.desc || '새 슬라이드';
          slides.push({
            id: targetId,
            imageUrl: proposal.imageUrl,
            caption: proposal.caption || proposal.desc || ''
          });
        } else if (proposal.action === 'update') {
          const idx = slides.findIndex(s => s.id === proposal.itemId);
          if (idx < 0) throw new Error('히어로 slide id를 찾지 못했어요.');
          if (proposal.imageUrl != null) slides[idx].imageUrl = proposal.imageUrl;
          if (proposal.caption != null || proposal.desc != null) {
            slides[idx].caption = proposal.caption != null ? proposal.caption : proposal.desc;
          }
          label = slides[idx].caption || targetId;
        } else if (proposal.action === 'delete') {
          const idx = slides.findIndex(s => s.id === proposal.itemId);
          if (idx < 0) throw new Error('히어로 slide id를 찾지 못했어요.');
          label = slides[idx].caption || targetId;
          slides.splice(idx, 1);
        } else {
          throw new Error('지원하지 않는 action이에요.');
        }
        return saveSection('hero', { slides }, {
          kind: 'hero',
          itemId: targetId,
          summary: `메인 그림 ${act}: ${label || targetId}`,
          detail: reason || `AI · 메인 그림 ${act}`
        });
      }

      if (section === 'food') {
        if (proposal.action === 'add' && !proposal.name) throw new Error('맛집 이름(name)이 필요해요.');
        const items = applyFoodPatch(state.food.items || [], proposal);
        const name = proposal.name
          || items.find(it => it.id === proposal.itemId)?.name
          || proposal.itemId
          || '맛집';
        return saveSection('food', { items }, {
          kind: 'food',
          itemId: proposal.itemId || '',
          summary: `맛집 ${act}: ${name}`,
          detail: reason || `AI · 맛집 ${act}`
        });
      }

      if (section === 'alternatives') {
        if (proposal.action === 'add' && !(proposal.title || proposal.name)) {
          throw new Error('대안 제목(title)이 필요해요.');
        }
        const items = applyAltPatch(state.alternatives.items || [], proposal);
        const title = proposal.title || proposal.name
          || items.find(it => it.id === proposal.itemId)?.title
          || proposal.itemId
          || '대안';
        return saveSection('alternatives', { items }, {
          kind: 'alt',
          itemId: proposal.itemId || '',
          summary: `귀국 대안 ${act}: ${title}`,
          detail: reason || `AI · 귀국 대안 ${act}`
        });
      }

      if (section === 'flights') {
        if (proposal.action === 'add' && !(proposal.title || proposal.flightNo)) {
          throw new Error('항공 추가에는 title 또는 flightNo가 필요해요.');
        }
        if ((proposal.action === 'update' || proposal.action === 'delete') && !proposal.itemId) {
          throw new Error('항공 수정/삭제에는 itemId(outbound|return)가 필요해요.');
        }
        const items = applyFlightPatch(state.flights.items || [], proposal);
        const hit = items.find(it => it.id === proposal.itemId) || items[items.length - 1];
        const label = hit?.flightNo || hit?.title || proposal.itemId || '항공';
        return saveSection('flights', { items }, {
          kind: 'flight',
          itemId: proposal.itemId || hit?.id || '',
          summary: `항공 ${act}: ${label} ${hit?.departTime || ''}→${hit?.arriveTime || ''}`.trim(),
          detail: reason || `AI · 항공 ${act}`
        });
      }

      if (section === 'resort') {
        if (proposal.action === 'add' && !(proposal.title || proposal.name)) {
          throw new Error('숙소 카드 추가에는 title이 필요해요.');
        }
        const items = applyResortPatch(state.resort.items || [], proposal);
        const title = proposal.title || proposal.name
          || items.find(it => it.id === proposal.itemId)?.title
          || proposal.itemId
          || '숙소';
        return saveSection('resort', { items }, {
          kind: 'resort',
          itemId: proposal.itemId || '',
          summary: `숙소 ${act}: ${title}`,
          detail: reason || `AI · 숙소 ${act}`
        });
      }
      return null;
    }
  };
}
