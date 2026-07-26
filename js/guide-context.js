/** 앱 가이드 요약 · 섹션별 본문 (AI 컨텍스트용) */

export const GUIDE_SECTIONS = [
  { id: 'food', title: '맛집', hash: '#food' },
  { id: 'massage', title: '마사지', hash: '#massage' },
  { id: 'hopping', title: '호핑투어', hash: '#hopping' },
  { id: 'resort', title: '리조트·픽업·셔틀', hash: '#resort' },
  { id: 'flights', title: '항공', hash: '#flights' },
  { id: 'late-rest', title: '귀국·휴식', hash: '#late-rest' },
  { id: 'tips', title: '주의사항', hash: '#tips' },
  { id: 'pack', title: '짐', hash: '#pack' },
  { id: 'map', title: '지도·동선', hash: '#map' },
  { id: 'live', title: '시각·환율', hash: '#live' },
  { id: 'itinerary', title: '일자별 일정', hash: '#itinerary' },
  { id: 'trip', title: '함께 준비', hash: '#trip' }
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
- #airport-pickup 공항픽업: 도착홀 피켓, 리무진/그랩, 심야 할증 가능
- #flights #map #tips #pack #itinerary #trip 도 앱에 있음

일정 반영: 맛집·마사지·호핑 등을 Day에 추가/수정할 때는 가이드 섹션을 확인한 뒤 propose_itinerary_change로 제안하고 사용자 적용을 받는다.
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
