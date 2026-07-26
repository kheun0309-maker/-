/** 코타키나발루 가이드 AI — 가이드 컨텍스트·웹검색·일정/콘텐츠 제안(확인 후 적용) */

import { getItineraryApi } from './itinerary-editor.js';
import { getGuideContentApi, formatRichText } from './guide-content.js';
import { getCustomSectionsApi } from './custom-sections.js';
import { getTripPackApi } from './trip-room.js';
import { GUIDE_SUMMARY, getGuideContext, listGuideSections } from './guide-context.js';
import { normalizeImageUrl, resolveAiImageUrl, listLocalImages } from './image-url.js';
import { getMyLocation } from './geo.js';

const KEY_STORAGE = 'kk-openai-api-key';
const MODEL_STORAGE = 'kk-openai-model';
const DEFAULT_MODEL = 'gpt-5.6-luna';
const MAX_HISTORY = 20;
const MAX_TOOL_ROUNDS = 8;

const SYSTEM_PROMPT = `당신은 이 여행 앱의 코파일럿입니다. 질문 답변뿐 아니라 일정·가이드·섹션·짐·항공 편집 제안까지 합니다. 1순위 근거는 앱 가이드입니다.

역할:
1) 가이드(get_guide_section) + 일정(get_itinerary) + 편집 스냅샷(get_editable_content)으로 답변
2) 영업시간·사진 URL·최신 정보는 web_search로 확인 (이미지 파일 업로드 불가, URL만)
3) 변경은 제안 도구만 사용하고 즉시 저장하지 않음
4) 핵심이 빠지면 ask_clarification
5) 「여기」「근처」「가까운」「내 위치」요청이면 먼저 get_my_location 호출 (브라우저 위치 권한 필요)

내 위치·근처 추천:
- get_my_location으로 lat/lng·nearbyGuidePlaces 확인
- 권한 거부/실패면 지도 「내 위치」허용을 안내하고, 리조트/시내 기준으로 대체 제안할지 물어보기
- 근처 맛집: web_search에 좌표 또는 가장 가까운 명소(예: Asia City)를 넣고, 가이드 #food와 맞춰 propose_content_change + 필요 시 propose_itinerary_change
- 거리는 직선 대략값. 이동시간은 가이드 동선 참고값을 함께 안내

정보 추가/정리 요청 시 (중요):
- 바로 저장 제안하지 말고 먼저 recommend_placement 호출
- 사용자에게 추천안을 짧게 제시: (1) 어느 기존 섹션에 넣을지 (2) 새 섹션 만들지 (3) 기존 항목 수정·통합할지 (4) 일정/짐에 넣을지
- 추천이 2개 이상이면 ask_clarification으로 선택 질문 후, 선택에 맞춰 propose_* 진행
- 한 가지가 명백하면 추천을 한 줄로 알리고 바로 propose_* (reason에 배치 근거 명시)

일정 추가·수정·삭제: propose_itinerary_change / propose_route_plan
항공: propose_content_change(section=flights, itemId=outbound|return) + 관련 일정도 함께
가이드: propose_content_change (hero|food|alternatives|flights)
커스텀: propose_custom_section (section / item)
준비물: propose_pack_change

이미지(중요):
- 파일 업로드 불가. imageUrl만 가능
- 1순위: 앱 내장 사진 ./images/... (get_editable_content의 localImages)
- 2순위: 직접 이미지 주소(.jpg/.png/.webp) 또는 Wikimedia upload.wikimedia.org
- 금지: 구글지도·Booking·트립어드바이저·후기/블로그 페이지·검색 결과 URL을 imageUrl에 넣기 (깨짐)
- 외부 URL이 불확실하면 imageUrl을 비우거나 localImages에서 주제 맞는 ./images를 고를 것

규칙: 한국어·간결. #food #late-rest #itinerary #flights #trip. 금액 MYR 우선.`;

const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'get_guide_section',
      description: '앱에 있는 가이드 본문/요약을 가져옵니다. 맛집·마사지·호핑 등 일정 반영 전에 우선 호출하세요.',
      parameters: {
        type: 'object',
        properties: {
          section: {
            type: 'string',
            description: 'summary|all|food|massage|hopping|resort|flights|tips|pack|map|live|itinerary|trip'
          }
        },
        required: ['section'],
        additionalProperties: false
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_itinerary',
      description: '현재 앱에 저장된 일자별 일정 스냅샷을 가져옵니다. 수정/삭제 전 반드시 호출하세요.',
      parameters: { type: 'object', properties: {}, additionalProperties: false }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_my_location',
      description:
        '사용자 기기 GPS 위치를 가져옵니다. 「여기/근처/가까운」 맛집·동선 요청 시 먼저 호출. 가이드 명소까지 직선 거리도 반환.',
      parameters: {
        type: 'object',
        properties: {
          force: {
            type: 'boolean',
            description: 'true면 캐시를 무시하고 위치를 다시 받음'
          }
        },
        additionalProperties: false
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_editable_content',
      description: '히어로·맛집·대안·준비물 편집용 스냅샷(id 포함). 수정/삭제 전 호출.',
      parameters: {
        type: 'object',
        properties: {
          section: {
            type: 'string',
            enum: ['all', 'hero', 'food', 'alternatives', 'flights', 'pack', 'custom'],
            description: '가져올 섹션'
          }
        },
        required: ['section'],
        additionalProperties: false
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'web_search',
      description: '앱 가이드에 없는 최신·상세 정보·공개 이미지 URL 검색.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: '검색어 (영어 또는 한국어). 이미지는 image/photo URL 포함 검색' }
        },
        required: ['query'],
        additionalProperties: false
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'recommend_placement',
      description: '정보를 어디에 넣을지 추천합니다. 기존 섹션 추가·새 섹션·기존 항목 수정/통합·일정/짐 옵션을 반환. 정보 추가 요청 시 먼저 호출.',
      parameters: {
        type: 'object',
        properties: {
          topic: { type: 'string', description: '주제 키워드 (예: 쇼핑, 카페, 귀국편, 짐)' },
          summary: { type: 'string', description: '넣으려는 내용 한 줄 요약' }
        },
        required: ['topic'],
        additionalProperties: false
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'ask_clarification',
      description: '배치/내용 확인이 필요할 때 사용. 이번 턴은 질문으로 끝냅니다.',
      parameters: {
        type: 'object',
        properties: {
          questions: {
            type: 'array',
            items: { type: 'string' },
            description: '1~3개의 짧은 확인 질문 (배치 선택 포함)'
          }
        },
        required: ['questions'],
        additionalProperties: false
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'propose_itinerary_change',
      description: '장소 1건 일정 추가·수정·삭제 제안. 사용자 적용 후에만 저장.',
      parameters: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['add', 'update', 'delete'] },
          day: { type: 'string', enum: ['day1', 'day2', 'day3', 'day4'] },
          itemId: { type: 'string', description: 'update/delete 시 필수' },
          time: { type: 'string', description: '영업시간·앞일정·이동을 반영한 시각 (예: 19:30~)' },
          place: { type: 'string' },
          task: { type: 'string' },
          note: { type: 'string', description: '영업시간·이동·예약 팁' },
          placeMapsUrl: { type: 'string' },
          reason: { type: 'string', description: '제안 이유·근거' }
        },
        required: ['action', 'day', 'reason'],
        additionalProperties: false
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'propose_route_plan',
      description: '같은 날 여러 장소를 시간·동선 순서로 묶어 제안합니다. 식사+마사지+이동 같은 코스에 사용.',
      parameters: {
        type: 'object',
        properties: {
          day: { type: 'string', enum: ['day1', 'day2', 'day3', 'day4'] },
          title: { type: 'string', description: '코스 제목 (예: 호핑 후 시내 동선)' },
          routeSummary: { type: 'string', description: 'A → B → C 형태 동선 한 줄' },
          reason: { type: 'string' },
          items: {
            type: 'array',
            minItems: 2,
            maxItems: 6,
            items: {
              type: 'object',
              properties: {
                time: { type: 'string' },
                place: { type: 'string' },
                task: { type: 'string' },
                note: { type: 'string' },
                placeMapsUrl: { type: 'string' },
                travelFromPrev: { type: 'string', description: '이전 장소에서 이동 시간/방법 (예: 그랩 15분)' }
              },
              required: ['time', 'place', 'task'],
              additionalProperties: false
            }
          }
        },
        required: ['day', 'title', 'routeSummary', 'reason', 'items'],
        additionalProperties: false
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'propose_content_change',
      description: '히어로·맛집·귀국 대안·항공(flights) 추가/수정/삭제. 항공은 outbound/return id. imageUrl은 URL만.',
      parameters: {
        type: 'object',
        properties: {
          section: { type: 'string', enum: ['hero', 'food', 'alternatives', 'flights'] },
          action: { type: 'string', enum: ['add', 'update', 'delete'] },
          itemId: { type: 'string', description: 'update/delete 필수. hero=h1~h5, flights=outbound|return' },
          tag: { type: 'string' },
          tagTone: { type: 'string', enum: ['ok', 'warn'], description: '항공 태그 색' },
          name: { type: 'string', description: '맛집 이름' },
          title: { type: 'string', description: '대안/항공 제목' },
          desc: { type: 'string' },
          body: { type: 'string', description: '항공 부가 설명' },
          caption: { type: 'string', description: '히어로 캡션' },
          imageUrl: { type: 'string', description: '직접 이미지(.jpg/.png) 또는 ./images/... (localImages). 지도/부킹/후기 페이지 URL 금지' },
          mapsUrl: { type: 'string' },
          siteUrl: { type: 'string' },
          reviewUrl: { type: 'string' },
          linkUrl: { type: 'string' },
          linkLabel: { type: 'string' },
          flightNo: { type: 'string', description: '예: KE5762' },
          dateLabel: { type: 'string', description: '예: 8/17(월) 새벽' },
          from: { type: 'string', description: '출발 공항 코드 ICN/BKI' },
          to: { type: 'string', description: '도착 공항 코드' },
          departTime: { type: 'string', description: '출발 시각 HH:MM' },
          arriveTime: { type: 'string', description: '도착 시각 HH:MM' },
          reason: { type: 'string' }
        },
        required: ['section', 'action', 'reason'],
        additionalProperties: false
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'propose_pack_change',
      description: '함께 준비 준비물(챙길 품목) 추가/수정/삭제 제안.',
      parameters: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['add', 'update', 'delete'] },
          itemId: { type: 'string', description: 'update/delete 시 필수' },
          text: { type: 'string', description: '준비물 문구' },
          reason: { type: 'string' }
        },
        required: ['action', 'reason'],
        additionalProperties: false
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'propose_custom_section',
      description: '커스텀 가이드 섹션 또는 그 안 정보 카드 추가/수정/삭제. 쇼핑·카페·팁 등 새 주제를 만들 때 사용.',
      parameters: {
        type: 'object',
        properties: {
          target: { type: 'string', enum: ['section', 'item'], description: 'section=접기 섹션 자체, item=섹션 안 카드' },
          action: { type: 'string', enum: ['add', 'update', 'delete'] },
          sectionId: { type: 'string', description: '영문/숫자 id (예: shopping). item 작업·section 수정/삭제에 필수' },
          title: { type: 'string', description: '섹션 제목 (예: 🛒 쇼핑 팁)' },
          intro: { type: 'string', description: '섹션 짧은 소개' },
          itemId: { type: 'string', description: '항목 id. item update/delete 필수' },
          itemTitle: { type: 'string', description: '항목 제목' },
          tag: { type: 'string' },
          body: { type: 'string', description: '항목 본문' },
          imageUrl: { type: 'string', description: '직접 이미지 또는 ./images/... (페이지 URL 금지)' },
          mapsUrl: { type: 'string' },
          linkUrl: { type: 'string' },
          linkLabel: { type: 'string' },
          reason: { type: 'string' }
        },
        required: ['target', 'action', 'reason'],
        additionalProperties: false
      }
    }
  }
];

function sanitizeImageField(raw, hint = '') {
  return resolveAiImageUrl(raw, hint);
}

function $(id) {
  return document.getElementById(id);
}

function blobText(...parts) {
  return parts.filter(Boolean).join(' ').toLowerCase();
}

function scoreHay(hay, needles) {
  let score = 0;
  const h = String(hay || '').toLowerCase();
  for (const n of needles) {
    const t = String(n || '').toLowerCase().trim();
    if (t && h.includes(t)) score += t.length >= 3 ? 3 : 1;
  }
  return score;
}

/** 정보 추가 시 배치·신규·통합 후보 추천 */
function buildPlacementRecommendations(topic, summary = '') {
  const q = blobText(topic, summary);
  const tokens = q.split(/[\s,/·|~\-]+/).filter(t => t.length >= 2);
  const content = getGuideContentApi().getSnapshot();
  const custom = getCustomSectionsApi().getSnapshot();
  const options = [];

  const buckets = [
    { kind: 'add_to_food', keys: ['맛집', '식사', '씨푸드', '해산물', 'restaurant', '카페', '커피', '바쿠테', '락사', '먹거리', '식당'], label: '시내 추천 맛집 (#food)', how: 'propose_content_change section=food action=add' },
    { kind: 'add_to_flights', keys: ['항공', '비행', '편명', 'ke57', '출국', '귀국', '이륙', '착륙', '비행기', '스케줄'], label: '항공 일정 (#flights)', how: 'propose_content_change section=flights action=update itemId=outbound|return' },
    { kind: 'add_to_alts', keys: ['napzone', '캡슐', '에어로포드', '데이유즈', '늦게', '귀국휴식'], label: '귀국·늦게 쉴 대안 (#late-rest)', how: 'propose_content_change section=alternatives' },
    { kind: 'add_to_pack', keys: ['짐', '챙길', '준비물', '썬크림', '선크림', '어댑터', '수영복', '모기'], label: '함께 준비 · 준비물', how: 'propose_pack_change action=add' },
    { kind: 'add_to_itin', keys: ['일정', '동선', '타임', '슬롯', 'day1', 'day2', 'day3', 'day4'], label: '일자별 일정 (#itinerary)', how: 'propose_itinerary_change' },
    { kind: 'guide_massage', keys: ['마사지', '스파', 'chillax', 'warisan'], label: '마사지 (#massage) + 필요시 커스텀/일정', how: '일정 반영 또는 propose_custom_section' },
    { kind: 'guide_hopping', keys: ['호핑', '섬', '마누칸', '제티', '스노클'], label: '호핑 (#hopping) + 일정 반영', how: 'propose_itinerary_change 또는 커스텀 팁' },
    { kind: 'guide_shopping', keys: ['쇼핑', '몰', 'imago', '가야', '기념품', '시장'], label: '쇼핑(커스텀 섹션 추천)', how: 'propose_custom_section target=section' }
  ];

  for (const b of buckets) {
    const sc = scoreHay(q, b.keys);
    if (sc > 0) {
      options.push({
        kind: b.kind,
        label: b.label,
        actionHint: b.how,
        reason: `'${topic}'이(가) ${b.label} 주제와 맞습니다.`,
        score: sc
      });
    }
  }

  for (const it of content.food?.items || []) {
    const hay = blobText(it.name, it.desc, it.tag);
    const sc = scoreHay(hay, tokens) + scoreHay(q, [it.name]);
    if (sc >= 3) {
      options.push({
        kind: 'update_food_item',
        label: `기존 맛집 수정·통합: ${it.name}`,
        section: 'food',
        itemId: it.id,
        actionHint: `propose_content_change section=food action=update itemId=${it.id}`,
        reason: '비슷한 맛집이 이미 있어 새 카드보다 보강·통합이 나을 수 있어요.',
        score: sc + 2
      });
    }
  }

  for (const it of content.flights?.items || []) {
    const hay = blobText(it.title, it.flightNo, it.body, it.id);
    const sc = scoreHay(hay, tokens) + scoreHay(q, [it.flightNo, '항공', '귀국', '출국']);
    if (sc >= 3) {
      options.push({
        kind: 'update_flight',
        label: `기존 항공 수정: ${it.title || it.flightNo}`,
        section: 'flights',
        itemId: it.id,
        actionHint: `propose_content_change section=flights action=update itemId=${it.id}`,
        reason: '항공 정보가 이미 있으니 시간을 고치거나 메모를 보강하세요. 관련 일정도 같이 수정 권장.',
        score: sc + 3
      });
    }
  }

  for (const sec of custom.sections || []) {
    const hay = blobText(sec.title, sec.intro, ...(sec.items || []).map(i => `${i.title} ${i.body} ${i.tag}`));
    const sc = scoreHay(hay, tokens) + scoreHay(q, [sec.title, sec.id]);
    if (sc >= 2) {
      options.push({
        kind: 'add_to_custom_section',
        label: `기존 커스텀 섹션에 항목 추가: ${sec.title}`,
        sectionId: sec.id,
        actionHint: `propose_custom_section target=item action=add sectionId=${sec.id}`,
        reason: '관련 섹션이 이미 있어요. 새 섹션보다 항목 추가가 깔끔합니다.',
        score: sc + 3
      });
      for (const it of sec.items || []) {
        const isc = scoreHay(blobText(it.title, it.body, it.tag), tokens);
        if (isc >= 3) {
          options.push({
            kind: 'update_custom_item',
            label: `기존 항목 수정·통합: ${sec.title} › ${it.title}`,
            sectionId: sec.id,
            itemId: it.id,
            actionHint: `propose_custom_section target=item action=update sectionId=${sec.id} itemId=${it.id}`,
            reason: '같은 주제 항목이 있어 내용을 합치거나 고치는 편이 좋아요.',
            score: isc + 4
          });
        }
      }
    }
  }

  const topBuiltin = options.reduce((m, o) => Math.max(m, o.score || 0), 0);
  const slug = String(topic || 'tips')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'tips';
  options.push({
    kind: 'new_custom_section',
    label: `새 커스텀 섹션 만들기: ${topic}`,
    suggestedTitle: topic,
    suggestedSectionId: slug,
    actionHint: 'propose_custom_section target=section action=add → 이어서 target=item action=add',
    reason: topBuiltin >= 4
      ? '기존 섹션도 가능하지만, 주제를 따로 모으고 싶으면 새 섹션이 좋아요.'
      : '맞는 고정 섹션이 약하면 새 섹션으로 모으는 걸 권장합니다.',
    score: topBuiltin >= 4 ? 2 : 5
  });

  if (/day\s*[1-4]|데이\s*[1-4]|일정|동선/.test(q)) {
    options.push({
      kind: 'also_itinerary',
      label: '일자별 일정에도 함께 반영',
      actionHint: 'propose_itinerary_change (가이드/섹션 반영과 병행)',
      reason: '가이드에만 두면 동선에서 빠질 수 있어요. 일정 슬롯에도 넣는 걸 권장합니다.',
      score: 3
    });
  }

  options.sort((a, b) => (b.score || 0) - (a.score || 0));
  const top = options.slice(0, 5);
  return {
    topic,
    summary: summary || '',
    recommended: top[0] || null,
    alternatives: top.slice(1),
    options: top,
    nextStep: '추천·대안을 사용자에게 보여 주세요. 선택이 필요하면 ask_clarification, 확정되면 actionHint로 propose_* 하세요.'
  };
}

function loadKey() {
  try { return localStorage.getItem(KEY_STORAGE) || ''; } catch (_) { return ''; }
}

function isLikelyOpenAiKey(key) {
  const k = String(key || '').trim();
  // sk-... / sk-proj-... / sk-svcacct-... 등
  return /^sk-[A-Za-z0-9_\-]{10,}$/.test(k);
}

function keyTail(key) {
  const k = String(key || '').trim();
  if (k.length < 8) return '';
  return k.slice(-4);
}

/** @returns {{ ok: boolean, error?: string }} */
function saveKey(key) {
  try {
    if (key) {
      localStorage.setItem(KEY_STORAGE, key);
      // 바로 다시 읽어 저장 성공 여부 확인 (사파리 비공개 등 실패 감지)
      if (localStorage.getItem(KEY_STORAGE) !== key) {
        return { ok: false, error: '저장 후 확인에 실패했어요. 브라우저 저장소가 막혀 있을 수 있어요.' };
      }
    } else {
      localStorage.removeItem(KEY_STORAGE);
    }
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: '이 브라우저에서 로컬 저장이 막혀 있어요. Chrome으로 열거나 시크릿 모드를 꺼 주세요.'
    };
  }
}

function loadModel() {
  try {
    const saved = localStorage.getItem(MODEL_STORAGE) || '';
    // 예전 기본값이면 루나로 갱신
    if (!saved || saved === 'gpt-4o-mini' || saved === 'gpt-4o' || saved === 'gpt-4.1-mini') {
      localStorage.setItem(MODEL_STORAGE, DEFAULT_MODEL);
      return DEFAULT_MODEL;
    }
    return saved;
  } catch (_) {
    return DEFAULT_MODEL;
  }
}

function saveModel(model) {
  try { localStorage.setItem(MODEL_STORAGE, model || DEFAULT_MODEL); } catch (_) {}
}

function esc(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function linkify(text) {
  // http(s) → 새 탭, #섹션id → 앱 내 이동 (한 패스로 겹침 방지)
  const source = String(text || '');
  if (!source) return '';
  const re = /(https?:\/\/[^\s<>"'`]+)|(#([a-z0-9-]+))/gi;
  let last = 0;
  let match;
  const parts = [];
  const pushText = (chunk) => {
    if (!chunk) return;
    parts.push(esc(chunk).replace(/\n/g, '<br>'));
  };
  while ((match = re.exec(source)) !== null) {
    pushText(source.slice(last, match.index));
    if (match[1]) {
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
    } else {
      const hash = match[3];
      parts.push(`<a href="#${esc(hash)}" data-open-hash="${esc(hash)}">#${esc(hash)}</a>`);
    }
    last = match.index + match[0].length;
  }
  pushText(source.slice(last));
  return parts.join('');
}

function fxHint() {
  try {
    const rate = typeof window.kkMyrToKrw === 'function' ? window.kkMyrToKrw() : null;
    if (Number.isFinite(rate)) return `현재 앱 환율 참고: 1 MYR ≈ ${Math.round(rate)}원.`;
  } catch (_) {}
  return '';
}

function dayLabel(day) {
  return ({ day1: 'DAY1', day2: 'DAY2', day3: 'DAY3', day4: 'DAY4' })[day] || day;
}

async function webSearch(apiKey, query) {
  const q = String(query || '').trim();
  if (!q) return { ok: false, summary: '검색어가 비어 있어요.' };

  // OpenAI Responses + web_search (키만으로 동작)
  try {
    const res = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: loadModel() || DEFAULT_MODEL,
        tools: [{ type: 'web_search_preview' }],
        input: `웹에서 사실을 찾아 한국어로 짧게 요약해 주세요. 출처 URL이 있으면 함께.\n검색: ${q}`
      })
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      let text = '';
      if (typeof data.output_text === 'string') text = data.output_text;
      else if (Array.isArray(data.output)) {
        text = data.output
          .flatMap(part => Array.isArray(part.content) ? part.content : [])
          .map(c => c.text || c.output_text || '')
          .filter(Boolean)
          .join('\n');
      }
      text = String(text || '').trim();
      if (text) return { ok: true, summary: text.slice(0, 2500) };
    }
  } catch (_) {}

  // 보조: Wikipedia OpenSearch (CORS 허용)
  try {
    const wiki = await fetch(
      `https://ko.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(q)}&limit=3&namespace=0&format=json&origin=*`
    );
    const arr = await wiki.json();
    const titles = arr?.[1] || [];
    const descs = arr?.[2] || [];
    const links = arr?.[3] || [];
    if (titles.length) {
      const lines = titles.map((t, i) => `- ${t}: ${descs[i] || ''} ${links[i] || ''}`.trim());
      return {
        ok: true,
        summary: `위키백과 참고(웹검색 대체):\n${lines.join('\n')}\n※ 영업시간·요금은 공식 사이트/현장 확인 권장.`
      };
    }
  } catch (_) {}

  return {
    ok: false,
    summary: '웹 검색을 지금 쓸 수 없어요. 일반 지식으로만 답하고, 불확실하면 사용자에게 확인 질문을 하세요.'
  };
}

export function initAiGuide() {
  const root = $('ai') || $('aiGuide');
  if (!root) return;

  const keyInput = $('aiApiKey');
  const modelSelect = $('aiModel');
  const saveBtn = $('aiKeySave');
  const clearBtn = $('aiKeyClear');
  const statusEl = $('aiStatus');
  const keySummary = $('aiKeySummary');
  const keyFold = $('aiKeyFold');
  const logEl = $('aiChatLog');
  const form = $('aiChatForm');
  const input = $('aiChatInput');
  const sendBtn = $('aiChatSend');
  const chipWrap = $('aiSuggestChips');

  let history = [];
  let busy = false;
  let proposalSeq = 0;
  const proposals = new Map();

  const hideEmptyHint = () => {
    $('aiChatEmpty')?.remove();
  };

  const openKeyFold = () => {
    const settings = $('settings');
    if (settings) settings.open = true;
    if (keyFold) keyFold.open = true;
  };

  const refreshKeyUi = (msg = '') => {
    const saved = loadKey();
    const model = loadModel();
    if (keyInput) {
      keyInput.value = saved ? `••••••••••••${keyTail(saved)}` : '';
      keyInput.placeholder = saved ? '저장됨 · 바꾸려면 새 키 붙여넣기' : 'sk-... 붙여넣고 저장';
    }
    if (keySummary) {
      keySummary.textContent = saved
        ? `준비됨 · …${keyTail(saved)} · ${model}`
        : '키 미설정 · 펼쳐서 붙여넣기';
      keySummary.classList.toggle('is-ready', Boolean(saved));
      keySummary.classList.toggle('is-missing', !saved);
    }
    if (msg) setStatus(msg, false);
    else if (saved) setStatus(`API 키 저장됨 (끝자리 ${keyTail(saved)}) · 이 기기에만 보관`);
    else setStatus('API 키를 붙여넣으면 자동 저장됩니다.');
  };

  const setStatus = (msg, isError = false) => {
    if (!statusEl) return;
    statusEl.textContent = msg || '';
    statusEl.classList.toggle('is-error', Boolean(isError && msg));
  };

  const persistKeyFromInput = ({ silent = false } = {}) => {
    const raw = (keyInput?.value || '').trim();
    if (!raw || raw.startsWith('••')) {
      if (!silent) setStatus(loadKey() ? `이미 저장됨 (끝자리 ${keyTail(loadKey())})` : '키를 붙여넣은 뒤 저장해 주세요.', !loadKey());
      return Boolean(loadKey());
    }
    if (!isLikelyOpenAiKey(raw)) {
      if (!silent) setStatus('OpenAI API 키 형식이 아니에요. sk- 로 시작하는 키를 붙여넣어 주세요.', true);
      return false;
    }
    const result = saveKey(raw);
    if (!result.ok) {
      setStatus(result.error || '저장 실패', true);
      return false;
    }
    saveModel(modelSelect?.value || DEFAULT_MODEL);
    refreshKeyUi('API 키를 이 기기에 저장했어요.');
    return true;
  };

  if (modelSelect) modelSelect.value = loadModel();
  refreshKeyUi();

  const appendBubble = (role, text) => {
    if (!logEl) return null;
    hideEmptyHint();
    const div = document.createElement('div');
    div.className = `ai-bubble ai-${role}`;
    if (role === 'assistant') div.innerHTML = linkify(text).replace(/\n/g, '<br>');
    else div.textContent = text;
    logEl.appendChild(div);
    logEl.scrollTop = logEl.scrollHeight;
    return div;
  };

  const appendProposalCard = (proposal) => {
    if (!logEl) return;
    hideEmptyHint();
    const itinApi = getItineraryApi();
    const contentApi = getGuideContentApi();
    const customApi = getCustomSectionsApi();
    const packApi = getTripPackApi();
    const canApply = proposal.type === 'content' || proposal.type === 'custom'
      ? (proposal.type === 'custom' ? customApi.canEdit() : contentApi.canEdit())
      : proposal.type === 'pack'
        ? packApi.canEdit()
        : itinApi.canEdit();
    const card = document.createElement('div');
    card.className = 'ai-bubble ai-assistant ai-proposal';
    const lines = [];
    const actionLabel = ({ add: '추가', update: '수정', delete: '삭제' })[proposal.action] || proposal.action;

    if (proposal.type === 'route') {
      lines.push(`<div class="ai-proposal-title">동선 제안 · ${esc(dayLabel(proposal.day))} · ${esc(proposal.title || '코스')}</div>`);
      if (proposal.routeSummary) {
        lines.push(`<div class="ai-proposal-route">${esc(proposal.routeSummary)}</div>`);
      }
      if (proposal.reason) lines.push(`<div class="ai-proposal-reason">${esc(proposal.reason)}</div>`);
      lines.push('<div class="ai-proposal-body">');
      (proposal.items || []).forEach((it, i) => {
        lines.push('<div class="ai-route-step">');
        lines.push(`<b>${i + 1}. ${esc(it.time || '')} · ${esc(it.place || '')}</b>`);
        if (it.task) lines.push(`<div>${esc(it.task)}</div>`);
        if (it.travelFromPrev) lines.push(`<div class="tiny">이동: ${esc(it.travelFromPrev)}</div>`);
        if (it.note) lines.push(`<div class="tiny">${esc(it.note)}</div>`);
        lines.push('</div>');
      });
      lines.push('</div>');
    } else if (proposal.type === 'content') {
      const secLabel = ({ hero: '메인 그림', food: '맛집', alternatives: '귀국 대안', flights: '항공' })[proposal.section] || proposal.section;
      lines.push(`<div class="ai-proposal-title">${esc(secLabel)} ${esc(actionLabel)} 제안</div>`);
      if (proposal.reason) lines.push(`<div class="ai-proposal-reason">${esc(proposal.reason)}</div>`);
      if (proposal.imageUrl) {
        const thumb = normalizeImageUrl(proposal.imageUrl);
        if (thumb) {
          lines.push(`<img class="ai-proposal-thumb" src="${esc(thumb)}" alt="미리보기" referrerpolicy="no-referrer" onerror="this.style.display='none'">`);
        }
      }
      lines.push('<div class="ai-proposal-body">');
      if (proposal.action === 'delete') {
        lines.push(`<div>삭제 id: ${esc(proposal.itemId || '')}</div>`);
      } else {
        if (proposal.name) lines.push(`<div>이름: ${esc(proposal.name)}</div>`);
        if (proposal.title) lines.push(`<div>제목: ${esc(proposal.title)}</div>`);
        if (proposal.flightNo) lines.push(`<div>편명: ${esc(proposal.flightNo)}</div>`);
        if (proposal.dateLabel) lines.push(`<div>날짜: ${esc(proposal.dateLabel)}</div>`);
        if (proposal.departTime || proposal.arriveTime) {
          lines.push(`<div>시간: ${esc(proposal.from || '')} ${esc(proposal.departTime || '')} → ${esc(proposal.to || '')} ${esc(proposal.arriveTime || '')}</div>`);
        }
        if (proposal.caption) lines.push(`<div>캡션: ${esc(proposal.caption)}</div>`);
        if (proposal.tag) lines.push(`<div>태그: ${esc(proposal.tag)}</div>`);
        if (proposal.body || proposal.desc) lines.push(`<div>${formatRichText(proposal.body || proposal.desc)}</div>`);
        if (proposal.imageUrl) lines.push(`<div class="tiny">사진: ${esc(proposal.imageUrl)}</div>`);
        if (proposal.imageNote) lines.push(`<div class="tiny">${esc(proposal.imageNote)}</div>`);
      }
      if (proposal.itemId) lines.push(`<div class="tiny">id: ${esc(proposal.itemId)}</div>`);
      lines.push('</div>');
    } else if (proposal.type === 'pack') {
      lines.push(`<div class="ai-proposal-title">준비물 ${esc(actionLabel)} 제안</div>`);
      if (proposal.reason) lines.push(`<div class="ai-proposal-reason">${esc(proposal.reason)}</div>`);
      lines.push('<div class="ai-proposal-body">');
      if (proposal.action === 'delete') lines.push(`<div>삭제 id: ${esc(proposal.itemId || '')}</div>`);
      else if (proposal.text) lines.push(`<div>${formatRichText(proposal.text)}</div>`);
      if (proposal.itemId && proposal.action !== 'add') lines.push(`<div class="tiny">id: ${esc(proposal.itemId)}</div>`);
      lines.push('</div>');
    } else if (proposal.type === 'custom') {
      const scope = proposal.target === 'item' ? '섹션 항목' : '커스텀 섹션';
      lines.push(`<div class="ai-proposal-title">${esc(scope)} ${esc(actionLabel)} 제안</div>`);
      if (proposal.reason) lines.push(`<div class="ai-proposal-reason">${esc(proposal.reason)}</div>`);
      if (proposal.imageUrl) {
        const thumb = normalizeImageUrl(proposal.imageUrl);
        if (thumb) {
          lines.push(`<img class="ai-proposal-thumb" src="${esc(thumb)}" alt="미리보기" referrerpolicy="no-referrer" onerror="this.style.display='none'">`);
        }
      }
      lines.push('<div class="ai-proposal-body">');
      if (proposal.sectionId) lines.push(`<div>sectionId: ${esc(proposal.sectionId)}</div>`);
      if (proposal.title) lines.push(`<div>섹션 제목: ${esc(proposal.title)}</div>`);
      if (proposal.intro) lines.push(`<div>소개: ${formatRichText(proposal.intro)}</div>`);
      if (proposal.itemTitle) lines.push(`<div>항목: ${esc(proposal.itemTitle)}</div>`);
      if (proposal.tag) lines.push(`<div>태그: ${esc(proposal.tag)}</div>`);
      if (proposal.body) lines.push(`<div>${formatRichText(proposal.body)}</div>`);
      if (proposal.imageUrl) lines.push(`<div class="tiny">사진: ${esc(proposal.imageUrl)}</div>`);
      if (proposal.imageNote) lines.push(`<div class="tiny">${esc(proposal.imageNote)}</div>`);
      if (proposal.itemId) lines.push(`<div class="tiny">itemId: ${esc(proposal.itemId)}</div>`);
      lines.push('</div>');
    } else {
      lines.push(`<div class="ai-proposal-title">일정 ${esc(actionLabel)} 제안 · ${esc(dayLabel(proposal.day))}</div>`);
      if (proposal.reason) lines.push(`<div class="ai-proposal-reason">${esc(proposal.reason)}</div>`);
      lines.push('<div class="ai-proposal-body">');
      if (proposal.action === 'delete') {
        lines.push(`<div>삭제 대상 ID: ${esc(proposal.itemId || '')}</div>`);
      } else {
        if (proposal.time) lines.push(`<div>시간: ${esc(proposal.time)}</div>`);
        if (proposal.place) lines.push(`<div>장소: ${esc(proposal.place)}</div>`);
        if (proposal.task) lines.push(`<div>할 일: ${esc(proposal.task)}</div>`);
        if (proposal.note) lines.push(`<div>메모: ${formatRichText(proposal.note)}</div>`);
      }
      if (proposal.action !== 'add' && proposal.itemId) {
        lines.push(`<div class="tiny">itemId: ${esc(proposal.itemId)}</div>`);
      }
      lines.push('</div>');
    }

    if (!canApply) {
      lines.push('<div class="ai-proposal-warn">여행방에 입장해야 적용할 수 있어요. (설정 → 여행방)</div>');
    }
    const applyLabel = proposal.type === 'route' ? '동선 전체 적용' : '적용';
    lines.push(`
      <div class="ai-proposal-actions">
        <button type="button" class="ai-apply" data-pid="${proposal.id}">${applyLabel}</button>
        <button type="button" class="ai-reject" data-pid="${proposal.id}">취소</button>
      </div>
    `);
    card.innerHTML = lines.join('');
    logEl.appendChild(card);
    logEl.scrollTop = logEl.scrollHeight;
  };

  const setBusy = (on) => {
    busy = on;
    if (sendBtn) sendBtn.disabled = on;
    if (input) input.disabled = on;
  };

  const runTool = async (apiKey, name, args) => {
    const api = getItineraryApi();
    if (name === 'get_guide_section') {
      setStatus('가이드 확인 중…');
      const section = args.section || 'summary';
      if (section === 'list') {
        return { sections: listGuideSections(), hint: '상세는 section 이름을 지정해 다시 호출하세요.' };
      }
      return getGuideContext(section);
    }
    if (name === 'get_itinerary') {
      return api.getSnapshot();
    }
    if (name === 'get_my_location') {
      setStatus('내 위치 확인 중… (권한 허용 필요)');
      return getMyLocation({ force: Boolean(args.force) });
    }
    if (name === 'get_editable_content') {
      const section = args.section || 'all';
      const content = getGuideContentApi().getSnapshot();
      const pack = getTripPackApi().getSnapshot();
      const custom = getCustomSectionsApi().getSnapshot();
      if (section === 'hero') return { hero: content.hero, editable: content.editable };
      if (section === 'food') return { food: content.food, editable: content.editable };
      if (section === 'alternatives') return { alternatives: content.alternatives, editable: content.editable };
      if (section === 'flights') return { flights: content.flights, editable: content.editable };
      if (section === 'pack') return pack;
      if (section === 'custom') return custom;
      return { ...content, pack, custom };
    }
    if (name === 'web_search') {
      setStatus('웹 검색 중…');
      return webSearch(apiKey, args.query);
    }
    if (name === 'recommend_placement') {
      setStatus('어디에 넣을지 분석 중…');
      return buildPlacementRecommendations(args.topic || '', args.summary || '');
    }
    if (name === 'ask_clarification') {
      const qs = Array.isArray(args.questions) ? args.questions.filter(Boolean).slice(0, 3) : [];
      return {
        asked: true,
        message: qs.length
          ? `아래를 확인해 주세요:\n${qs.map((q, i) => `${i + 1}. ${q}`).join('\n')}`
          : '조금만 더 알려 주세요.'
      };
    }
    if (name === 'propose_itinerary_change') {
      const id = `p${++proposalSeq}`;
      const proposal = {
        id,
        type: 'single',
        action: args.action,
        day: args.day,
        itemId: args.itemId || '',
        time: args.time || '',
        place: args.place || '',
        task: args.task || '',
        note: args.note || '',
        placeMapsUrl: args.placeMapsUrl || '',
        reason: args.reason || '',
        status: 'pending'
      };
      if ((proposal.action === 'update' || proposal.action === 'delete') && !proposal.itemId) {
        return { ok: false, error: 'update/delete에는 itemId가 필요해요. get_itinerary로 확인하세요.' };
      }
      if (proposal.action === 'add' && !proposal.place && !proposal.task) {
        return { ok: false, error: '추가하려면 place 또는 task가 필요해요.' };
      }
      proposals.set(id, proposal);
      appendProposalCard(proposal);
      return {
        ok: true,
        proposalId: id,
        status: 'waiting_user_confirmation',
        note: '사용자에게 적용/취소 버튼을 보여줬습니다. 적용 전에는 일정이 저장되지 않습니다.'
      };
    }
    if (name === 'propose_route_plan') {
      const items = Array.isArray(args.items) ? args.items.slice(0, 6) : [];
      if (items.length < 2) {
        return { ok: false, error: '동선 제안은 장소 2곳 이상 필요해요.' };
      }
      const id = `r${++proposalSeq}`;
      const proposal = {
        id,
        type: 'route',
        day: args.day,
        title: args.title || '동선 제안',
        routeSummary: args.routeSummary || '',
        reason: args.reason || '',
        items: items.map(it => ({
          time: it.time || '',
          place: it.place || '',
          task: it.task || '',
          note: [it.travelFromPrev ? `이동 ${it.travelFromPrev}` : '', it.note || ''].filter(Boolean).join(' · '),
          placeMapsUrl: it.placeMapsUrl || '',
          travelFromPrev: it.travelFromPrev || ''
        })),
        status: 'pending'
      };
      if (!/^day[1-4]$/.test(String(proposal.day || ''))) {
        return { ok: false, error: 'day는 day1~day4 중 하나여야 해요.' };
      }
      proposals.set(id, proposal);
      appendProposalCard(proposal);
      return {
        ok: true,
        proposalId: id,
        status: 'waiting_user_confirmation',
        itemCount: proposal.items.length,
        note: '동선 전체 적용 버튼이 표시되었습니다. 적용 전 저장되지 않습니다.'
      };
    }
    if (name === 'propose_content_change') {
      const section = args.section;
      const action = args.action;
      if (!['hero', 'food', 'alternatives', 'flights'].includes(section)) {
        return { ok: false, error: 'section은 hero|food|alternatives|flights 여야 해요.' };
      }
      if ((action === 'update' || action === 'delete') && !args.itemId) {
        return { ok: false, error: 'update/delete에는 itemId가 필요해요. get_editable_content로 확인하세요.' };
      }
      if (action === 'add' && section === 'hero' && !args.imageUrl) {
        return { ok: false, error: '히어로 추가에는 imageUrl이 필요해요. localImages의 ./images/... 를 쓰세요.' };
      }
      if (action === 'add' && section === 'food' && !args.name) {
        return { ok: false, error: '맛집 추가에는 name이 필요해요.' };
      }
      if (action === 'add' && section === 'flights' && !(args.title || args.flightNo)) {
        return { ok: false, error: '항공 추가에는 title 또는 flightNo가 필요해요.' };
      }
      const imgHint = [args.name, args.title, args.caption, args.desc, args.tag, args.reason].filter(Boolean).join(' ');
      const id = `c${++proposalSeq}`;
      const proposal = {
        id,
        type: 'content',
        section,
        action,
        itemId: args.itemId || '',
        tag: args.tag || '',
        tagTone: args.tagTone || '',
        name: args.name || '',
        title: args.title || '',
        desc: args.desc || '',
        body: args.body || '',
        caption: args.caption || '',
        mapsUrl: args.mapsUrl || '',
        siteUrl: args.siteUrl || '',
        reviewUrl: args.reviewUrl || '',
        linkUrl: args.linkUrl || '',
        linkLabel: args.linkLabel || '',
        flightNo: args.flightNo || '',
        dateLabel: args.dateLabel || '',
        from: args.from || '',
        to: args.to || '',
        departTime: args.departTime || '',
        arriveTime: args.arriveTime || '',
        reason: args.reason || '',
        status: 'pending'
      };
      if (args.imageUrl != null) {
        const img = sanitizeImageField(args.imageUrl, imgHint);
        proposal.imageUrl = img.url;
        if (img.warning) proposal.imageNote = img.warning;
        if (action === 'add' && section === 'hero' && !img.url) {
          return {
            ok: false,
            error: '히어로 imageUrl이 유효하지 않아요. get_editable_content → localImages에서 ./images/... 를 고르세요.',
            localImages: listLocalImages().slice(0, 8)
          };
        }
      }
      proposals.set(id, proposal);
      appendProposalCard(proposal);
      return {
        ok: true,
        proposalId: id,
        status: 'waiting_user_confirmation',
        imageUrl: proposal.imageUrl || '',
        imageNote: proposal.imageNote || '',
        note: '적용 전 저장되지 않습니다. 사진 미리보기를 확인하세요.'
      };
    }
    if (name === 'propose_pack_change') {
      if ((args.action === 'update' || args.action === 'delete') && !args.itemId) {
        return { ok: false, error: 'update/delete에는 itemId가 필요해요.' };
      }
      if ((args.action === 'add' || args.action === 'update') && !args.text) {
        return { ok: false, error: '준비물 text가 필요해요.' };
      }
      const id = `k${++proposalSeq}`;
      const proposal = {
        id,
        type: 'pack',
        action: args.action,
        itemId: args.itemId || '',
        text: args.text || '',
        reason: args.reason || '',
        status: 'pending'
      };
      proposals.set(id, proposal);
      appendProposalCard(proposal);
      return {
        ok: true,
        proposalId: id,
        status: 'waiting_user_confirmation'
      };
    }
    if (name === 'propose_custom_section') {
      const target = args.target;
      const action = args.action;
      if (!['section', 'item'].includes(target)) {
        return { ok: false, error: 'target은 section 또는 item 이어야 해요.' };
      }
      if (target === 'section') {
        if (action === 'add' && !args.title) {
          return { ok: false, error: '섹션 추가에는 title이 필요해요.' };
        }
        if ((action === 'update' || action === 'delete') && !args.sectionId) {
          return { ok: false, error: '섹션 수정/삭제에는 sectionId가 필요해요.' };
        }
      }
      if (target === 'item') {
        if (!args.sectionId) {
          return { ok: false, error: '항목 작업에는 sectionId가 필요해요. 없으면 먼저 섹션을 추가하세요.' };
        }
        if (action === 'add' && !(args.itemTitle || args.title || args.name)) {
          return { ok: false, error: '항목 추가에는 itemTitle이 필요해요.' };
        }
        if ((action === 'update' || action === 'delete') && !args.itemId) {
          return { ok: false, error: '항목 수정/삭제에는 itemId가 필요해요.' };
        }
      }
      const id = `s${++proposalSeq}`;
      const proposal = {
        id,
        type: 'custom',
        target,
        action,
        sectionId: args.sectionId || '',
        title: args.title || '',
        intro: args.intro || '',
        itemId: args.itemId || '',
        itemTitle: args.itemTitle || args.title || args.name || '',
        tag: args.tag || '',
        body: args.body || args.desc || '',
        mapsUrl: args.mapsUrl || '',
        linkUrl: args.linkUrl || '',
        linkLabel: args.linkLabel || '',
        reason: args.reason || '',
        status: 'pending'
      };
      if (args.imageUrl != null) {
        const imgHint = [args.itemTitle, args.title, args.name, args.tag, args.body, args.reason].filter(Boolean).join(' ');
        const img = sanitizeImageField(args.imageUrl, imgHint);
        proposal.imageUrl = img.url;
        if (img.warning) proposal.imageNote = img.warning;
      }
      proposals.set(id, proposal);
      appendProposalCard(proposal);
      return {
        ok: true,
        proposalId: id,
        status: 'waiting_user_confirmation',
        imageUrl: proposal.imageUrl || '',
        imageNote: proposal.imageNote || '',
        note: '적용 전 저장되지 않습니다.'
      };
    }
    return { ok: false, error: `알 수 없는 도구: ${name}` };
  };

  /** gpt-5.6* + tools 는 chat/completions에서 reasoning_effort 기본값이 막힘 → none 고정 */
  const needsToolsReasoningNone = (model) => /^gpt-5\.6/i.test(String(model || ''));

  const chatWithTools = async (apiKey, model, messages) => {
    let clarificationText = '';
    for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
      setStatus(round ? `도구 실행 중… (${round + 1})` : '답변 작성 중…');
      const payload = {
        model,
        messages,
        tools: TOOLS,
        tool_choice: 'auto'
      };
      if (needsToolsReasoningNone(model)) {
        payload.reasoning_effort = 'none';
      } else {
        payload.temperature = 0.3;
      }
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`
        },
        body: JSON.stringify(payload)
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error?.message || `요청 실패 (${res.status})`);
      }
      const msg = data?.choices?.[0]?.message;
      if (!msg) throw new Error('빈 응답이에요.');

      messages.push(msg);
      const toolCalls = msg.tool_calls || [];
      if (!toolCalls.length) {
        const content = String(msg.content || clarificationText || '').trim();
        if (!content) throw new Error('빈 답변을 받았어요.');
        return content;
      }

      for (const call of toolCalls) {
        const name = call.function?.name || '';
        let args = {};
        try { args = JSON.parse(call.function?.arguments || '{}'); } catch (_) { args = {}; }
        const result = await runTool(apiKey, name, args);
        if (name === 'ask_clarification' && result?.message) {
          clarificationText = result.message;
        }
        messages.push({
          role: 'tool',
          tool_call_id: call.id,
          content: JSON.stringify(result)
        });
      }

      // 확인 질문만 있으면 바로 반환
      if (toolCalls.every(c => c.function?.name === 'ask_clarification') && clarificationText) {
        return clarificationText;
      }
    }
    return clarificationText || '제안/검색을 정리했어요. 필요하면 이어서 말해 주세요.';
  };

  saveBtn?.addEventListener('click', () => {
    persistKeyFromInput({ silent: false });
  });

  // 붙여넣기만 해도 저장 (저장 버튼 깜빡임 방지)
  keyInput?.addEventListener('paste', () => {
    window.setTimeout(() => persistKeyFromInput({ silent: false }), 0);
  });
  keyInput?.addEventListener('change', () => {
    persistKeyFromInput({ silent: false });
  });
  keyInput?.addEventListener('blur', () => {
    persistKeyFromInput({ silent: true });
  });

  clearBtn?.addEventListener('click', () => {
    const result = saveKey('');
    if (!result.ok) {
      setStatus(result.error || '삭제 실패', true);
      return;
    }
    if (keyInput) {
      keyInput.value = '';
      keyInput.placeholder = 'sk-... 붙여넣고 저장';
    }
    history = [];
    proposals.clear();
    if (logEl) {
      logEl.innerHTML = '<div class="ai-chat-empty" id="aiChatEmpty">일정 추가, 가이드 수정, 섹션 만들기까지 요청할 수 있어요. 위 칩으로 바로 시작해 보세요.</div>';
    }
    refreshKeyUi('API 키를 이 기기에서 삭제했어요.');
    openKeyFold();
  });

  modelSelect?.addEventListener('change', () => {
    saveModel(modelSelect.value);
    refreshKeyUi();
  });

  chipWrap?.addEventListener('click', e => {
    const btn = e.target.closest('[data-ai-q]');
    if (!btn || busy) return;
    if (input) input.value = btn.dataset.aiQ || '';
    form?.requestSubmit();
  });

  logEl?.addEventListener('click', async e => {
    const a = e.target.closest('a[data-open-hash]');
    if (a) {
      e.preventDefault();
      const id = a.getAttribute('data-open-hash');
      const openId = ['airport-pickup', 'resort-shuttle'].includes(id) ? 'resort' : id;
      const section = document.getElementById(openId) || document.getElementById(id);
      if (section?.tagName === 'DETAILS') section.open = true;
      (document.getElementById(id) || section)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      history.replaceState(null, '', `#${id}`);
      return;
    }

    const applyBtn = e.target.closest('.ai-apply');
    const rejectBtn = e.target.closest('.ai-reject');
    if (!applyBtn && !rejectBtn) return;

    const pid = (applyBtn || rejectBtn).dataset.pid;
    const proposal = proposals.get(pid);
    if (!proposal || proposal.status !== 'pending') return;

    if (rejectBtn) {
      proposal.status = 'rejected';
      applyBtn?.setAttribute('disabled', 'disabled');
      rejectBtn.setAttribute('disabled', 'disabled');
      appendBubble('assistant', '제안을 취소했어요.');
      history.push({ role: 'assistant', content: `사용자가 일정 제안(${pid})을 취소했습니다.` });
      return;
    }

    const itinApi = getItineraryApi();
    const contentApi = getGuideContentApi();
    const customApi = getCustomSectionsApi();
    const packApi = getTripPackApi();
    const needsRoom = true;
    const canApply = proposal.type === 'content' || proposal.type === 'custom'
      ? (proposal.type === 'custom' ? customApi.canEdit() : contentApi.canEdit())
      : proposal.type === 'pack'
        ? packApi.canEdit()
        : itinApi.canEdit();
    if (needsRoom && !canApply) {
      setStatus('여행방에 입장한 뒤 적용할 수 있어요.', true);
      appendBubble('assistant', '여행방에 입장해야 저장할 수 있어요. 설정 → 여행방에서 입장해 주세요.');
      return;
    }

    applyBtn.disabled = true;
    rejectBtn?.setAttribute('disabled', 'disabled');
    setStatus('적용 중…');
    try {
      if (proposal.type === 'content') {
        await contentApi.applyProposal(proposal);
        proposal.status = 'applied';
        const hash = proposal.section === 'hero' ? '' : (proposal.section === 'food' ? '#food' : '#late-rest');
        appendBubble('assistant', `가이드에 반영했어요.${hash ? ` 앱에서 보기: ${hash}` : ' 메인 그림을 확인해 보세요.'}`);
        history.push({
          role: 'assistant',
          content: `사용자가 콘텐츠 제안(${pid})을 적용했습니다. section=${proposal.section}, action=${proposal.action}.`
        });
        if (proposal.section === 'food') document.getElementById('food')?.setAttribute('open', '');
        if (proposal.section === 'alternatives') document.getElementById('late-rest')?.setAttribute('open', '');
        if (proposal.section === 'flights') document.getElementById('flights')?.setAttribute('open', '');
      } else if (proposal.type === 'custom') {
        const result = await customApi.applyProposal(proposal);
        proposal.status = 'applied';
        const sid = result?.id || result?.sectionId || proposal.sectionId || '';
        const hash = sid ? `#custom-${sid}` : '';
        appendBubble('assistant', `커스텀 섹션에 반영했어요.${hash ? ` 앱에서 보기: ${hash}` : ''}`);
        history.push({
          role: 'assistant',
          content: `사용자가 커스텀 섹션 제안(${pid})을 적용했습니다. target=${proposal.target}, action=${proposal.action}, sectionId=${sid}.`
        });
        if (sid) {
          const el = document.getElementById(`custom-${sid}`);
          if (el) {
            el.open = true;
            el.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }
        }
      } else if (proposal.type === 'pack') {
        if (proposal.action === 'add') await packApi.addPack(proposal.text);
        else if (proposal.action === 'update') await packApi.updatePack(proposal.itemId, proposal.text);
        else if (proposal.action === 'delete') await packApi.deletePack(proposal.itemId);
        else throw new Error('알 수 없는 준비물 제안이에요.');
        proposal.status = 'applied';
        appendBubble('assistant', '준비물에 반영했어요. 앱에서 보기: #trip');
        history.push({
          role: 'assistant',
          content: `사용자가 준비물 제안(${pid})을 적용했습니다. action=${proposal.action}.`
        });
        document.getElementById('trip')?.setAttribute('open', '');
      } else if (proposal.type === 'route') {
        for (const it of proposal.items || []) {
          await itinApi.addItem({
            day: proposal.day,
            time: it.time,
            place: it.place,
            task: it.task,
            note: it.note,
            placeMapsUrl: it.placeMapsUrl
          });
        }
        proposal.status = 'applied';
        appendBubble('assistant', `동선 ${proposal.items.length}곳을 일정에 반영했어요. 앱에서 보기: #itinerary`);
        history.push({
          role: 'assistant',
          content: `사용자가 동선 제안(${pid})을 적용했습니다. day=${proposal.day}, items=${proposal.items.length}.`
        });
        document.getElementById('itinerary')?.setAttribute('open', '');
      } else if (proposal.action === 'add') {
        await itinApi.addItem(proposal);
        proposal.status = 'applied';
        appendBubble('assistant', '일정에 반영했어요. 앱에서 보기: #itinerary');
        history.push({
          role: 'assistant',
          content: `사용자가 일정 제안(${pid})을 적용했습니다. action=${proposal.action}, day=${proposal.day}.`
        });
        document.getElementById('itinerary')?.setAttribute('open', '');
      } else if (proposal.action === 'update') {
        await itinApi.updateItem(proposal.itemId, proposal);
        proposal.status = 'applied';
        appendBubble('assistant', '일정에 반영했어요. 앱에서 보기: #itinerary');
        history.push({
          role: 'assistant',
          content: `사용자가 일정 제안(${pid})을 적용했습니다. action=${proposal.action}, day=${proposal.day}.`
        });
        document.getElementById('itinerary')?.setAttribute('open', '');
      } else if (proposal.action === 'delete') {
        await itinApi.deleteItem(proposal.itemId);
        proposal.status = 'applied';
        appendBubble('assistant', '일정에 반영했어요. 앱에서 보기: #itinerary');
        history.push({
          role: 'assistant',
          content: `사용자가 일정 제안(${pid})을 적용했습니다. action=${proposal.action}, day=${proposal.day}.`
        });
        document.getElementById('itinerary')?.setAttribute('open', '');
      } else {
        throw new Error('알 수 없는 제안 형식이에요.');
      }
      setStatus('반영했어요.');
    } catch (err) {
      proposal.status = 'pending';
      applyBtn.disabled = false;
      if (rejectBtn) rejectBtn.disabled = false;
      const msg = err?.message || '적용 실패';
      appendBubble('assistant', `적용에 실패했어요: ${msg}`);
      setStatus(msg, true);
    }
  });

  form?.addEventListener('submit', async e => {
    e.preventDefault();
    if (busy) return;
    const question = (input?.value || '').trim();
    if (!question) return;

    // 입력란에만 붙여넣고 저장 안 누른 경우 전송 직전에 한번 더 저장 시도
    persistKeyFromInput({ silent: true });
    const apiKey = loadKey();
    if (!apiKey) {
      openKeyFold();
      setStatus('먼저 OpenAI API 키를 붙여넣어 주세요. (자동 저장됩니다)', true);
      keyInput?.focus();
      return;
    }

    appendBubble('user', question);
    if (input) input.value = '';
    history.push({ role: 'user', content: question });
    if (history.length > MAX_HISTORY) history = history.slice(-MAX_HISTORY);

    setBusy(true);
    const thinking = document.createElement('div');
    thinking.className = 'ai-bubble ai-assistant ai-thinking';
    thinking.textContent = '생각 중… (검색·일정 확인 가능)';
    logEl?.appendChild(thinking);

    try {
      const api = getItineraryApi();
      const model = loadModel();
      const sys = [
        SYSTEM_PROMPT,
        GUIDE_SUMMARY,
        fxHint(),
        api.canEdit()
          ? `현재 여행방 ${api.tripCode()}에 ${api.nickname()}(으)로 입장되어 일정 편집 가능.`
          : '아직 여행방 미입장. 일정 제안은 가능하지만 적용하려면 입장이 필요함을 안내.',
        '도구: get_guide_section, get_itinerary, get_my_location, get_editable_content, recommend_placement, web_search, ask_clarification, propose_itinerary_change, propose_route_plan, propose_content_change, propose_pack_change, propose_custom_section',
        '근처/여기: get_my_location → web_search/가이드 → propose_*',
        '정보 추가: recommend_placement → (필요시 ask_clarification) → propose_*',
        '메인 그림/맛집/대안/항공: get_editable_content → propose_content_change',
        '새 섹션·항목: propose_custom_section',
        '준비물: propose_pack_change'
      ].filter(Boolean).join('\n\n');

      const messages = [
        { role: 'system', content: sys },
        ...history
      ];
      const answer = await chatWithTools(apiKey, model, messages);
      thinking.remove();
      appendBubble('assistant', answer);
      history.push({ role: 'assistant', content: answer });
      if (history.length > MAX_HISTORY) history = history.slice(-MAX_HISTORY);
      setStatus('');
    } catch (err) {
      thinking.remove();
      const msg = err?.message || '오류가 발생했어요.';
      appendBubble('assistant', `죄송해요. ${msg}`);
      setStatus(msg, true);
      if (history.length && history[history.length - 1].role === 'user') history.pop();
    } finally {
      setBusy(false);
      input?.focus();
    }
  });
}
