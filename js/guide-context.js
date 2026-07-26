/** 앱 가이드 요약 · 섹션별 본문 (AI 컨텍스트용) */

export const GUIDE_SECTIONS = [
  { id: 'ai', title: '여행 코파일럿', hash: '#ai' },
  { id: 'trip', title: '함께 준비', hash: '#trip' },
  { id: 'itinerary', title: '일자별 일정', hash: '#itinerary' },
  { id: 'flights', title: '항공', hash: '#flights' },
  { id: 'resort', title: '리조트·픽업·셔틀', hash: '#resort' },
  { id: 'map', title: '지도·동선', hash: '#map' },
  { id: 'hopping', title: '호핑투어', hash: '#hopping' },
  { id: 'food', title: '맛집', hash: '#food' },
  { id: 'massage', title: '마사지', hash: '#massage' },
  { id: 'late-rest', title: '귀국·휴식', hash: '#late-rest' },
  { id: 'tips', title: '주의사항', hash: '#tips' },
  { id: 'pack', title: '짐', hash: '#pack' },
  { id: 'live', title: '시각·환율', hash: '#live' },
  { id: 'settings', title: '설정', hash: '#settings' }
];

/** 매 요청에 넣는 짧은 가이드 요약 (토큰 절약) */
export const GUIDE_SUMMARY = `
[앱 가이드 요약]
여행: 2026-08-13~17 · 숙소 Shangri-La Rasa Ria(Tuaran, 시내/공항 약 45분)
항공: KE5761 ICN→BKI 야간 도착 / 귀국 KE5762(잠정)
Day1: 인천 출국·BKI 도착·픽업·리조트 휴식
Day2: 리조트 풀데이 + 반딧불이(Sunset Cruise & Fireflies, 리조트 Activity Desk)
Day3: 호핑(South Jetty/Jesselton) + 시내 맛집(해산물) + 마사지(Warisan/Asia City)
Day4/귀국: 시내·휴식·공항 이동(늦은 비행 대비 Napzone 등)

주요 섹션:
- #food 맛집: 웰컴/쌍천 씨푸드(Asia City), 버터새우·칠리크랩 등
- #massage 마사지: Sunset Kinabalu·Chillax(Warisan), Kama'A(Asia City), Ulu Ulu / 발 MYR45~70·전신 MYR60~120대
- #hopping 호핑: 현지 흥정 MYR150~230대 참고, 섬 입장료 별도 가능, 리조트→제티 픽업 확인
- #resort-shuttle 셔틀: 라사리아↔제셀톤·이마고, 프론트 예약·정원 약40, 하루 수회
- #airport-pickup 공항픽업: 도착홀 피켓, 호텔 리무진/그랩/써드파티
- #third-party-pickup 써드파티: TYH 밴 MYR250·Alphard MYR350, OTA(KKday등) MYR120~160대, Grab MYR60~80(심야 불확실). 호텔 Innova MYR230(+심야50%)
- #flights #map #tips #pack #itinerary #trip 도 앱에 있음
- 내 위치: 코파일럿 get_my_location (브라우저 GPS). 「근처/여기」맛집·동선에 사용

동선·이동 시간 참고(그랩/차량, 교통·대기 포함 여유):
- 라사 리아 ↔ KKIA 공항: 약 45~55분
- 라사 리아 ↔ 시내(이마고/가야/제셀톤): 약 40~55분
- 라사 리아 ↔ 호핑 제티(South Jetty): 약 45~60분 · 아침 일찍 픽업 권장
- Asia City(해산물) ↔ Warisan Square(마사지): 약 10~20분
- 제티/시내 중심 ↔ Asia City: 약 10~20분
- 시내 이동 후 리조트 복귀: 밤길 포함 약 45~60분

시간 잡기 팁:
- 앞 일정이 끝나면 +이동시간 +여유 15~30분 뒤에 다음 시작
- 영업시간은 web_search 또는 가이드로 확인 후 time에 반영 (예: 19:30~)
- 셔틀 막차/호핑 하선 시각을 기준으로 저녁 식사·마사지 슬롯 제안

일정 반영: 장소·시간·동선은 propose_itinerary_change / propose_route_plan.
가이드 편집: 메인 그림·맛집·대안·항공(flights)은 propose_content_change.
일정 추가/수정은 propose_itinerary_change. 커스텀 섹션은 propose_custom_section. 준비물은 propose_pack_change.
정보 추가 시 recommend_placement로 배치·신규·통합을 먼저 추천.
`.trim();

function cleanText(s) {
  return String(s || '')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

function sectionText(id, maxLen = 3500) {
  const el = document.getElementById(id);
  if (!el) return '';
  const summary = el.querySelector('summary')?.innerText || '';
  const body = el.querySelector('.fold-body')?.innerText || el.innerText || '';
  // 환산 원화 중복·버튼 문구 축약
  let text = cleanText(`${summary}\n${body}`)
    .replace(/\(약 [^)]+원(?:~[^)]+원)?\)/g, '')
    .replace(/펼치기|접기/g, '');
  if (text.length > maxLen) text = `${text.slice(0, maxLen)}…`;
  return text;
}

export function listGuideSections() {
  return GUIDE_SECTIONS.map(s => ({
    ...s,
    available: Boolean(document.getElementById(s.id))
  }));
}

/**
 * @param {string} section food|massage|hopping|resort|all|summary 등
 */
export function getGuideContext(section = 'summary') {
  const key = String(section || 'summary').toLowerCase();

  if (key === 'summary' || key === 'overview') {
    return {
      section: 'summary',
      hash: '#ai',
      title: '가이드 요약',
      text: GUIDE_SUMMARY
    };
  }

  if (key === 'all') {
    const parts = GUIDE_SECTIONS.map(s => {
      const text = sectionText(s.id, 1800);
      if (!text) return '';
      return `## ${s.title} (${s.hash})\n${text}`;
    }).filter(Boolean);
    let text = `${GUIDE_SUMMARY}\n\n${parts.join('\n\n')}`;
    if (text.length > 12000) text = `${text.slice(0, 12000)}…`;
    return {
      section: 'all',
      hash: '#',
      title: '전체 가이드',
      text
    };
  }

  // 별칭
  const aliases = {
    restaurant: 'food',
    restaurants: 'food',
    맛집: 'food',
    spa: 'massage',
    마사지: 'massage',
    island: 'hopping',
    호핑: 'hopping',
    shuttle: 'resort',
    셔틀: 'resort',
    pickup: 'resort',
    픽업: 'resort',
    airport: 'resort',
    hotel: 'resort',
    리조트: 'resort'
  };
  const id = aliases[key] || key;
  const meta = GUIDE_SECTIONS.find(s => s.id === id);
  const text = sectionText(id);
  if (!text) {
    return {
      section: id,
      hash: meta?.hash || `#${id}`,
      title: meta?.title || id,
      text: `섹션을 찾지 못했어요. 사용 가능: ${GUIDE_SECTIONS.map(s => s.id).join(', ')}, summary, all`,
      ok: false
    };
  }
  return {
    ok: true,
    section: id,
    hash: meta?.hash || `#${id}`,
    title: meta?.title || id,
    text: `## ${meta?.title || id} (${meta?.hash || `#${id}`})\n${text}`
  };
}
