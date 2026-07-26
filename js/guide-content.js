/** 여행방 공유 가이드 콘텐츠 (히어로·맛집·대안) — URL 이미지, Storage 없음 */

import {
  doc,
  getDoc,
  setDoc,
  onSnapshot,
  serverTimestamp
} from 'https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js';
import { logTripActivity } from './itinerary-editor.js';

const SECTIONS = ['hero', 'food', 'alternatives'];

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
  alternatives: deepClone(DEFAULT_ALTERNATIVES)
};

function esc(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function nl2br(s) {
  return esc(s).replace(/\n/g, '<br>');
}

export function normalizeImageUrl(raw) {
  const u = String(raw || '').trim();
  if (!u) return '';
  if (u.startsWith('./') || u.startsWith('../') || u.startsWith('/')) return u.slice(0, 500);
  if (/^https:\/\//i.test(u)) return u.slice(0, 500);
  if (/^http:\/\//i.test(u)) return u.slice(0, 500);
  return '';
}

function cloneDefaults() {
  return {
    hero: deepClone(DEFAULT_HERO),
    food: deepClone(DEFAULT_FOOD),
    alternatives: deepClone(DEFAULT_ALTERNATIVES)
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
    const photo = it.imageUrl
      ? `<img class="card-photo" src="${esc(it.imageUrl)}" alt="${esc(it.name)}" loading="lazy" referrerpolicy="no-referrer">`
      : '';
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
    const photo = it.imageUrl
      ? `<img class="card-photo" src="${esc(it.imageUrl)}" alt="" loading="lazy" referrerpolicy="no-referrer">`
      : '';
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

function renderAll() {
  renderHero();
  renderFood();
  renderAlternatives();
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

async function ensureSection(section) {
  const snap = await getDoc(sectionRef(section));
  if (snap.exists()) return snap.data();
  const base = section === 'hero'
    ? normalizeHero(state.hero)
    : section === 'food'
      ? normalizeFood(state.food)
      : normalizeAlts(state.alternatives);
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
  const normalized = section === 'hero'
    ? normalizeHero(data)
    : section === 'food'
      ? normalizeFood(data)
      : normalizeAlts(data);
  if (section === 'hero' && !normalized.slides.length) {
    throw new Error('히어로 이미지가 최소 1장 필요해요.');
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
        hint: '수정/삭제 시 itemId(또는 hero slide id)를 사용하세요. imageUrl은 https:// 또는 ./images/ 경로.'
      };
    },
    async applyProposal(proposal) {
      if (!canEdit()) throw new Error('여행방에 입장해야 적용할 수 있어요.');
      const section = proposal.section;
      if (!SECTIONS.includes(section)) throw new Error('section은 hero|food|alternatives 중 하나여야 해요.');

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
      return null;
    }
  };
}
