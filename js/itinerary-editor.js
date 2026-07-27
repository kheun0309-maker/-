import {
  collection,
  doc,
  getDocs,
  setDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  orderBy,
  writeBatch,
  serverTimestamp
} from 'https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js';
import { DEFAULT_DAYS } from './itinerary-data.js';
import { LOCAL_IMAGES, normalizeImageUrl, isWebpageNotImage } from './image-url.js';

const root = document.getElementById('itineraryApp');
const hint = document.getElementById('itinEditHint');
if (!root) {
  // section not present
}

const MAX_ITIN_EVENTS = 40;
const DAY_LABEL = { day1: 'DAY1', day2: 'DAY2', day3: 'DAY3', day4: 'DAY4' };

let ctx = null; // { db, tripCode, nickname }
let unsubs = [];
let activeDay = 'day1';
let dayMeta = {};
let itemsByDay = { day1: [], day2: [], day3: [], day4: [] };
let dragId = null;
let editable = false;

async function logItinEvent({ kind, day = '', summary = '', detail = '', itemId = '' }) {
  if (!ctx?.db || !ctx?.tripCode || !ctx?.nickname) return;
  try {
    await addDoc(collection(ctx.db, 'trips', ctx.tripCode, 'itinEvents'), {
      kind: String(kind || 'edit').slice(0, 24),
      day: String(day || '').slice(0, 12),
      summary: String(summary || '일정 변경').slice(0, 200),
      detail: String(detail || '').slice(0, 400),
      itemId: String(itemId || '').slice(0, 80),
      updatedBy: String(ctx.nickname).slice(0, 24),
      updatedAt: serverTimestamp()
    });
    const snap = await getDocs(
      query(collection(ctx.db, 'trips', ctx.tripCode, 'itinEvents'), orderBy('updatedAt', 'desc'))
    );
    if (snap.docs.length > MAX_ITIN_EVENTS) {
      snap.docs.slice(MAX_ITIN_EVENTS).forEach(extra => {
        deleteDoc(extra.ref).catch(() => {});
      });
    }
  } catch (err) {
    console.warn('itin event log failed', err);
  }
}

/** 일정·가이드·준비물 등 여행방 변경 알림 (다른 멤버 미읽음 배지) */
export async function logTripActivity(opts) {
  return logItinEvent(opts);
}

function itemSummary(itemish) {
  const time = String(itemish?.time || '').trim();
  const place = String(itemish?.place || '').trim();
  const task = String(itemish?.task || '').trim();
  const core = [place, task].filter(Boolean).join(' · ') || '일정';
  return time ? `${time} ${core}` : core;
}

function clipText(s, n = 40) {
  const t = String(s || '').replace(/\s+/g, ' ').trim();
  if (!t) return '(비움)';
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
}

function fieldChangeLine(label, before, after) {
  const a = String(before || '').trim();
  const b = String(after || '').trim();
  if (a === b) return '';
  if (!a && b) return `${label} 추가: ${clipText(b)}`;
  if (a && !b) return `${label} 삭제됨`;
  return `${label} ${clipText(a, 28)} → ${clipText(b, 28)}`;
}

function diffItemFields(before, after) {
  const lines = [
    fieldChangeLine('시간', before?.time, after?.time),
    fieldChangeLine('장소', before?.place, after?.place),
    fieldChangeLine('할 일', before?.task, after?.task),
    fieldChangeLine('메모', before?.note, after?.note),
    fieldChangeLine('사진', before?.imageUrl, after?.imageUrl),
    fieldChangeLine('지도', before?.placeMapsUrl, after?.placeMapsUrl)
  ].filter(Boolean);
  return lines.join(' · ');
}

function diffDayMetaFields(before, after) {
  const lines = [
    fieldChangeLine('배지', before?.badge, after?.badge),
    fieldChangeLine('제목', before?.title, after?.title),
    fieldChangeLine('설명', before?.subtitle, after?.subtitle)
  ].filter(Boolean);
  return lines.join(' · ');
}

function kindLabel(kind) {
  return ({
    add: '추가',
    edit: '수정',
    delete: '삭제',
    reorder: '순서 변경',
    cover: '대표 사진',
    dayMeta: '하루 정보'
  })[kind] || '변경';
}

function clearUnsubs() {
  unsubs.forEach(fn => {
    try { fn(); } catch (_) {}
  });
  unsubs = [];
}

function canEdit() {
  return Boolean(ctx?.tripCode && ctx?.db && ctx?.nickname);
}

function esc(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function looksLikeDirectImageUrl(url) {
  if (!url) return false;
  if (url.startsWith('./') || url.startsWith('/')) return true;
  if (isWebpageNotImage(url)) return false;
  if (/\.(jpe?g|png|gif|webp|avif)(\?|#|$)/i.test(url)) return true;
  if (/drive\.google\.com\/uc\?/i.test(url)) return true;
  if (/googleusercontent\.com|ggpht\.com|imgur\.com|cloudinary\.com|unsplash\.com|images\.unsplash\.com|upload\.wikimedia\.org/i.test(url)) return true;
  return /^https?:\/\//i.test(url);
}

function mapsUrlFor(place, existing) {
  if (existing) return existing;
  const q = String(place || '').trim();
  if (!q) return '';
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
}

function photoHtml(url, className = 'itin-item-photo') {
  const src = normalizeImageUrl(url);
  if (!src) return '';
  return `
    <div class="${className}">
      <img src="${esc(src)}" alt="" loading="lazy" referrerpolicy="no-referrer"
        onerror="var p=this.parentElement;if(p)p.classList.add('is-broken')">
      <div class="itin-photo-fail">이미지를 불러오지 못했어요. 직접 이미지 주소(.jpg/.png)나 앱 내 사진을 사용해 주세요.</div>
    </div>
  `;
}

function localImagePickerHtml(inputId) {
  return `
    <div class="itin-local-photos">
      <div class="tiny" style="margin:0 0 6px">앱에 있는 사진 고르기 (추천 · 깨지지 않음)</div>
      <div class="itin-local-grid">
        ${LOCAL_IMAGES.map(img => `
          <button type="button" class="itin-local-thumb" data-set-img="${esc(inputId)}" data-url="${esc(img.url)}" title="${esc(img.label)}">
            <img src="${esc(img.url)}" alt="${esc(img.label)}" loading="lazy">
          </button>
        `).join('')}
      </div>
    </div>
  `;
}

function bindImageFields(el, inputId) {
  const input = el.querySelector(`#${inputId}`);
  const preview = el.querySelector(`#${inputId}Preview`);
  const updatePreview = () => {
    if (!preview) return;
    const src = normalizeImageUrl(input?.value || '');
    if (!src) {
      preview.hidden = true;
      preview.classList.remove('is-broken');
      preview.querySelector('img').removeAttribute('src');
      return;
    }
    preview.hidden = false;
    preview.classList.remove('is-broken');
    preview.querySelector('img').src = src;
  };
  el.querySelectorAll(`[data-set-img="${inputId}"]`).forEach(btn => {
    btn.onclick = () => {
      if (input) input.value = btn.getAttribute('data-url') || '';
      updatePreview();
    };
  });
  input?.addEventListener('input', updatePreview);
  input?.addEventListener('change', () => {
    if (input) input.value = normalizeImageUrl(input.value);
    updatePreview();
  });
  updatePreview();
}

function assertImageUrlOrEmpty(raw, required = false) {
  const url = normalizeImageUrl(raw);
  if (!url) {
    if (required) throw new Error('이미지 URL을 넣어 주세요.');
    return '';
  }
  if (!looksLikeDirectImageUrl(url) && !url.startsWith('./')) {
    // 저장은 허용하되 안내
    const ok = confirm('이 주소는 이미지 직접 링크가 아닐 수 있어요.\n카카오톡/블로그 글 주소는 보통 안 보입니다.\n그래도 저장할까요?');
    if (!ok) throw new Error('저장을 취소했습니다.');
  }
  return url;
}

async function seedItinerary() {
  const { db, tripCode, nickname } = ctx;
  const metaSnap = await getDocs(collection(db, 'trips', tripCode, 'dayMeta'));
  if (!metaSnap.empty) return;

  const batch = writeBatch(db);
  DEFAULT_DAYS.forEach(day => {
    batch.set(doc(db, 'trips', tripCode, 'dayMeta', day.id), {
      badge: day.badge,
      title: day.title,
      subtitle: day.subtitle,
      coverUrl: day.coverUrl,
      updatedBy: nickname,
      updatedAt: serverTimestamp()
    });
    day.items.forEach((item, index) => {
      const ref = doc(collection(db, 'trips', tripCode, 'items'));
      batch.set(ref, {
        day: day.id,
        order: index,
        time: item.time || '',
        place: item.place || '',
        task: item.task || '',
        note: item.note || '',
        imageUrl: item.imageUrl || '',
        placeMapsUrl: item.placeMapsUrl || mapsUrlFor(item.place, ''),
        updatedBy: nickname,
        updatedAt: serverTimestamp()
      });
    });
  });
  await batch.commit();
}

function bindLive() {
  clearUnsubs();
  const { db, tripCode } = ctx;

  unsubs.push(onSnapshot(collection(db, 'trips', tripCode, 'dayMeta'), snap => {
    dayMeta = {};
    snap.docs.forEach(d => { dayMeta[d.id] = { id: d.id, ...d.data() }; });
    render();
  }));

  unsubs.push(onSnapshot(
    query(collection(db, 'trips', tripCode, 'items'), orderBy('order')),
    snap => {
      itemsByDay = { day1: [], day2: [], day3: [], day4: [] };
      snap.docs.forEach(d => {
        const data = { id: d.id, ...d.data() };
        if (itemsByDay[data.day]) itemsByDay[data.day].push(data);
      });
      Object.keys(itemsByDay).forEach(day => {
        itemsByDay[day].sort((a, b) => (a.order || 0) - (b.order || 0));
      });
      render();
    }
  ));
}

function renderReadonlyDefaults() {
  if (!root) return;
  editable = false;
  if (hint) {
    hint.hidden = false;
    hint.textContent = '여행방에 입장하면 일정을 함께 수정·드래그·사진 URL을 넣을 수 있어요.';
  }
  root.innerHTML = buildShellHtml(DEFAULT_DAYS.map(d => ({
    meta: d,
    items: d.items.map((it, i) => ({ id: `${d.id}-${i}`, ...it, order: i }))
  })));
  bindTabs();
  afterPaint();
}

function currentDaysView() {
  return ['day1', 'day2', 'day3', 'day4'].map(id => {
    const fallback = DEFAULT_DAYS.find(d => d.id === id);
    const meta = dayMeta[id] || {
      id,
      badge: fallback.badge,
      title: fallback.title,
      subtitle: fallback.subtitle,
      coverUrl: fallback.coverUrl
    };
    return { meta, items: itemsByDay[id] || [] };
  });
}

function buildShellHtml(days) {
  const tabLabels = { day1: 'Day1 · 13', day2: 'Day2 · 14', day3: 'Day3 · 15', day4: 'Day4 · 16' };
  const tabs = days.map((d, i) => {
    const dayId = DEFAULT_DAYS[i].id;
    return `<button class="day-tab ${dayId === activeDay ? 'active' : ''}" data-day="${dayId}" type="button">${tabLabels[dayId]}</button>`;
  }).join('');

  const panels = days.map((d, i) => {
    const dayId = DEFAULT_DAYS[i].id;
    const meta = d.meta;
    const items = d.items;
    return `
      <article class="day-panel ${dayId === activeDay ? 'active' : ''}" data-day-panel="${dayId}">
        <div class="day-head">
          <span class="day-badge">${esc(meta.badge || '')}</span>
          <h2>${esc(meta.title || '')}</h2>
          <p>${esc(meta.subtitle || '')}</p>
          ${editable ? `
            <div class="itin-day-actions">
              <button type="button" class="itin-btn" data-edit-day="${dayId}">하루 정보 수정</button>
              <button type="button" class="itin-btn" data-edit-cover="${dayId}">대표 사진</button>
            </div>
          ` : ''}
        </div>
        ${photoHtml(meta.coverUrl || './images/kkia-airport.jpg', 'day-photo')}
        <ul class="timeline" data-day-list="${dayId}">
          ${items.map(item => renderItem(item, dayId)).join('') || '<li class="itin-empty">일정이 없습니다. 추가해 보세요.</li>'}
        </ul>
        ${editable ? `
          <button type="button" class="itin-add" data-add-item="${dayId}">+ 일정 추가</button>
        ` : ''}
      </article>
    `;
  }).join('');

  return `
    <div class="day-tabs" role="tablist">${tabs}</div>
    ${panels}
    ${editable ? '<p class="tiny">길게 눌러 드래그하면 순서를 바꿀 수 있어요. 장소는 구글 지도 검색/링크로 저장됩니다.</p>' : ''}
  `;
}

function formatTimeDisplay(time) {
  const t = String(time || '').trim();
  if (!t) return '';
  // 17:30~18:30 / 17:30 ~ 18:30 → 두 줄로 나눠 카드와 겹치지 않게
  const m = t.match(/^(\d{1,2}:\d{2})\s*~\s*(\d{1,2}:\d{2})(.*)$/);
  if (m) return `${m[1]}~\n${m[2]}${m[3] || ''}`;
  if (t.length > 8 && t.includes('~')) return t.replace(/\s*~\s*/, '~\n');
  return t;
}

function renderItem(item, dayId) {
  const maps = item.placeMapsUrl || mapsUrlFor(item.place, '');
  return `
    <li class="itin-item ${editable ? 'is-editable' : ''}" data-item-id="${esc(item.id)}" draggable="${editable ? 'true' : 'false'}">
      ${editable ? '<div class="itin-drag" aria-hidden="true">⋮⋮</div>' : ''}
      <div class="t-time">${esc(formatTimeDisplay(item.time || ''))}</div>
      <div class="t-body">
        <div class="t-place">${esc(item.place || '')}</div>
        <div class="t-task">${esc(item.task || '')}</div>
        ${item.note ? `<div class="t-note">${esc(item.note).replace(/\n/g, '<br>')}</div>` : ''}
        ${item.imageUrl ? photoHtml(item.imageUrl) : ''}
        ${maps ? `<a class="itin-maps" href="${esc(maps)}" target="_blank" rel="noopener">지도 보기</a>` : ''}
        ${editable ? `
          <div class="itin-item-actions">
            <button type="button" class="itin-btn" data-edit-item="${esc(item.id)}">수정</button>
            <button type="button" class="itin-btn danger" data-del-item="${esc(item.id)}">삭제</button>
          </div>
          ${item.updatedBy ? `<div class="tiny">최근 수정: ${esc(item.updatedBy)}</div>` : ''}
        ` : ''}
      </div>
    </li>
  `;
}

function afterPaint() {
  try {
    if (typeof window.refreshMyrKrwLabels === 'function') {
      window.refreshMyrKrwLabels(root);
    }
  } catch (_) {}
  try {
    if (typeof window.refreshItinChangeHighlights === 'function') {
      window.refreshItinChangeHighlights();
    }
  } catch (_) {}
}

function render() {
  if (!root) return;
  editable = canEdit();
  if (hint) {
    hint.hidden = false;
    hint.textContent = editable
      ? `여행방 ${ctx.tripCode} · ${ctx.nickname}님, 일정을 함께 수정할 수 있어요.`
      : '여행방에 입장하면 일정을 함께 수정·드래그·사진 URL을 넣을 수 있어요.';
  }
  if (!editable) {
    // keep defaults unless we somehow have data
    renderReadonlyDefaults();
    return;
  }
  root.innerHTML = buildShellHtml(currentDaysView());
  bindTabs();
  bindEditorEvents();
  bindDrag();
  afterPaint();
}

function bindTabs() {
  root.querySelectorAll('.day-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      activeDay = tab.dataset.day;
      root.querySelectorAll('.day-tab').forEach(t => t.classList.toggle('active', t === tab));
      root.querySelectorAll('[data-day-panel]').forEach(p => {
        p.classList.toggle('active', p.dataset.dayPanel === activeDay);
      });
    });
  });
}

function bindEditorEvents() {
  root.querySelectorAll('[data-edit-day]').forEach(btn => {
    btn.addEventListener('click', () => openDayEditor(btn.dataset.editDay));
  });
  root.querySelectorAll('[data-edit-cover]').forEach(btn => {
    btn.addEventListener('click', () => openCoverEditor(btn.dataset.editCover));
  });
  root.querySelectorAll('[data-add-item]').forEach(btn => {
    btn.addEventListener('click', () => openItemEditor(btn.dataset.addItem, null));
  });
  root.querySelectorAll('[data-edit-item]').forEach(btn => {
    btn.addEventListener('click', () => {
      const item = findItem(btn.dataset.editItem);
      if (item) openItemEditor(item.day, item);
    });
  });
  root.querySelectorAll('[data-del-item]').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('이 일정을 삭제할까요?')) return;
      try {
        const prev = findItem(btn.dataset.delItem);
        await deleteDoc(doc(ctx.db, 'trips', ctx.tripCode, 'items', btn.dataset.delItem));
        await logItinEvent({
          kind: 'delete',
          day: prev?.day || '',
          itemId: prev?.id || btn.dataset.delItem || '',
          summary: `${DAY_LABEL[prev?.day] || ''} ${kindLabel('delete')}: ${itemSummary(prev)}`.trim(),
          detail: `삭제된 일정 · ${itemSummary(prev)}`
        });
      } catch (e) {
        alert(e.message || '삭제 실패');
      }
    });
  });
}

function findItem(id) {
  for (const day of Object.keys(itemsByDay)) {
    const found = itemsByDay[day].find(it => it.id === id);
    if (found) return found;
  }
  return null;
}

function bindDrag() {
  root.querySelectorAll('.itin-item[draggable="true"]').forEach(li => {
    li.addEventListener('dragstart', e => {
      dragId = li.dataset.itemId;
      li.classList.add('is-dragging');
      e.dataTransfer.effectAllowed = 'move';
    });
    li.addEventListener('dragend', () => {
      li.classList.remove('is-dragging');
      dragId = null;
    });
    li.addEventListener('dragover', e => {
      e.preventDefault();
      li.classList.add('drag-over');
    });
    li.addEventListener('dragleave', () => li.classList.remove('drag-over'));
    li.addEventListener('drop', async e => {
      e.preventDefault();
      li.classList.remove('drag-over');
      const targetId = li.dataset.itemId;
      if (!dragId || dragId === targetId) return;
      const from = findItem(dragId);
      const to = findItem(targetId);
      if (!from || !to || from.day !== to.day) return;
      const list = [...itemsByDay[from.day]];
      const fromIdx = list.findIndex(x => x.id === dragId);
      const toIdx = list.findIndex(x => x.id === targetId);
      if (fromIdx < 0 || toIdx < 0) return;
      const [moved] = list.splice(fromIdx, 1);
      list.splice(toIdx, 0, moved);
      try {
        const batch = writeBatch(ctx.db);
        list.forEach((item, index) => {
          batch.update(doc(ctx.db, 'trips', ctx.tripCode, 'items', item.id), {
            order: index,
            updatedBy: ctx.nickname,
            updatedAt: serverTimestamp()
          });
        });
        await batch.commit();
        await logItinEvent({
          kind: 'reorder',
          day: from.day,
          itemId: moved?.id || '',
          summary: `${DAY_LABEL[from.day] || ''} ${kindLabel('reorder')}`,
          detail: `${itemSummary(moved)} 위치를 바꿈`
        });
      } catch (err) {
        alert(err.message || '순서 변경 실패');
      }
    });
  });
}

function modal(html) {
  const wrap = document.createElement('div');
  wrap.className = 'itin-modal';
  wrap.innerHTML = `<div class="itin-modal-card">${html}</div>`;
  document.body.appendChild(wrap);
  const close = () => wrap.remove();
  wrap.addEventListener('click', e => {
    if (e.target === wrap) close();
  });
  return { wrap, close, el: wrap.querySelector('.itin-modal-card') };
}

function openDayEditor(dayId) {
  const meta = dayMeta[dayId] || DEFAULT_DAYS.find(d => d.id === dayId);
  const { wrap, close, el } = modal(`
    <h3>하루 정보 수정</h3>
    <label>배지<textarea id="mBadge" rows="1">${esc(meta.badge || '')}</textarea></label>
    <label>제목<textarea id="mTitle" rows="2">${esc(meta.title || '')}</textarea></label>
    <label>설명<textarea id="mSub" rows="3">${esc(meta.subtitle || '')}</textarea></label>
    <div class="itin-modal-actions">
      <button type="button" class="itin-btn" data-cancel>취소</button>
      <button type="button" class="itin-btn primary" data-save>저장</button>
    </div>
  `);
  el.querySelector('[data-cancel]').onclick = close;
  el.querySelector('[data-save]').onclick = async () => {
    try {
      const next = {
        badge: el.querySelector('#mBadge').value.trim().slice(0, 40),
        title: el.querySelector('#mTitle').value.trim().slice(0, 80),
        subtitle: el.querySelector('#mSub').value.trim().slice(0, 160)
      };
      const detail = diffDayMetaFields(meta, next) || '하루 정보 저장';
      await setDoc(doc(ctx.db, 'trips', ctx.tripCode, 'dayMeta', dayId), {
        ...next,
        coverUrl: meta.coverUrl || '',
        updatedBy: ctx.nickname,
        updatedAt: serverTimestamp()
      }, { merge: true });
      await logItinEvent({
        kind: 'dayMeta',
        day: dayId,
        summary: `${DAY_LABEL[dayId] || dayId} ${kindLabel('dayMeta')}: ${next.title || '하루 정보'}`,
        detail
      });
      close();
    } catch (e) {
      alert(e.message || '저장 실패');
    }
  };
}

function openCoverEditor(dayId) {
  const meta = dayMeta[dayId] || DEFAULT_DAYS.find(d => d.id === dayId);
  const { wrap, close, el } = modal(`
    <h3>대표 사진</h3>
    <p class="tiny" style="margin:0 0 8px">
      <b>이미지 파일 주소</b>가 필요합니다. (.jpg/.png로 끝나는 링크)<br>
      카카오톡·블로그 글 주소는 안 보여요. 구글 드라이브는 파일 공유 링크를 넣으면 자동 변환됩니다.
    </p>
    ${localImagePickerHtml('mUrl')}
    <label>또는 이미지 URL<input id="mUrl" type="text" value="${esc(meta.coverUrl || '')}" placeholder="https://...jpg 또는 드라이브 공유 링크"></label>
    <div id="mUrlPreview" class="itin-item-photo itin-preview" hidden>
      <img alt="미리보기" referrerpolicy="no-referrer" onerror="var p=this.parentElement;if(p)p.classList.add('is-broken')">
      <div class="itin-photo-fail">미리보기가 안 되면 저장해도 화면에 안 나올 수 있어요.</div>
    </div>
    <div class="itin-modal-actions">
      <button type="button" class="itin-btn" data-cancel>취소</button>
      <button type="button" class="itin-btn primary" data-save>저장</button>
    </div>
  `);
  bindImageFields(el, 'mUrl');
  el.querySelector('[data-cancel]').onclick = close;
  el.querySelector('[data-save]').onclick = async () => {
    try {
      const url = assertImageUrlOrEmpty(el.querySelector('#mUrl').value, true);
      const prevCover = String(meta.coverUrl || '').trim();
      await setDoc(doc(ctx.db, 'trips', ctx.tripCode, 'dayMeta', dayId), {
        badge: meta.badge || '',
        title: meta.title || '',
        subtitle: meta.subtitle || '',
        coverUrl: url,
        updatedBy: ctx.nickname,
        updatedAt: serverTimestamp()
      }, { merge: true });
      await logItinEvent({
        kind: 'cover',
        day: dayId,
        summary: `${DAY_LABEL[dayId] || dayId} ${kindLabel('cover')}`,
        detail: prevCover ? `대표 사진 교체 (${clipText(url, 48)})` : `대표 사진 추가 (${clipText(url, 48)})`
      });
      close();
    } catch (e) {
      alert(e.message || '저장 실패');
    }
  };
}

function parseClockMinutes(timeStr) {
  const s = String(timeStr || '').trim();
  if (!s) return null;
  const m = s.match(/(\d{1,2})\s*[:：.]\s*(\d{2})/);
  if (m) {
    const h = Number(m[1]);
    const min = Number(m[2]);
    if (h >= 0 && h <= 23 && min >= 0 && min <= 59) return h * 60 + min;
  }
  if (/새벽|심야|취침|밤/.test(s)) return 22 * 60;
  if (/저녁|석양|sunset/i.test(s)) return 18 * 60;
  if (/오후/.test(s)) return 14 * 60;
  if (/낮|점심/.test(s)) return 12 * 60;
  if (/오전|아침|조식|늦잠|기상/.test(s)) return 9 * 60;
  return null;
}

function formatClock(mins, withTilde = false) {
  const total = ((mins % (24 * 60)) + (24 * 60)) % (24 * 60);
  const h = Math.floor(total / 60);
  const m = total % 60;
  const t = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  return withTilde ? `${t}~` : t;
}

function minutesToTimeValue(mins) {
  const total = ((mins % (24 * 60)) + (24 * 60)) % (24 * 60);
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function getPrevSchedule(dayId, item) {
  const list = itemsByDay[dayId] || [];
  if (!list.length) return null;
  if (!item) return list[list.length - 1];
  const idx = list.findIndex(it => it.id === item.id);
  if (idx <= 0) return null;
  return list[idx - 1];
}

function buildTimeFieldHtml(dayId, item, initialTime) {
  const prev = getPrevSchedule(dayId, item);
  const prevMins = prev ? parseClockMinutes(prev.time) : null;
  const parsed = parseClockMinutes(initialTime);
  const hasTilde = /~$/.test(String(initialTime || '').trim());
  const clockValue = parsed != null ? minutesToTimeValue(parsed) : (prevMins != null ? minutesToTimeValue(prevMins + 60) : '10:00');
  const suggestOffsets = [
    { label: '+30분', add: 30 },
    { label: '+1시간', add: 60 },
    { label: '+1.5시간', add: 90 },
    { label: '+2시간', add: 120 },
    { label: '+3시간', add: 180 }
  ];
  const suggestBtns = prevMins != null
    ? suggestOffsets.map(s => {
        const t = formatClock(prevMins + s.add);
        return `<button type="button" class="itin-chip" data-set-time="${esc(t)}">${esc(s.label)} · ${esc(t)}</button>`;
      }).join('')
    : '';

  const prevHtml = prev
    ? `<div class="itin-prev-schedule">
        <span class="itin-prev-label">앞 일정</span>
        <strong>${esc(prev.time || '시간 미정')}</strong>
        <span>${esc([prev.place, prev.task].filter(Boolean).join(' · ') || '내용 없음')}</span>
      </div>`
    : `<div class="itin-prev-schedule is-empty">이 날의 첫 일정이에요. 아래에서 시간을 골라 주세요.</div>`;

  return `
    <div class="itin-time-box">
      ${prevHtml}
      ${suggestBtns ? `<div class="itin-time-suggest"><span class="tiny">앞 일정 기준 추천</span><div class="itin-chip-row">${suggestBtns}</div></div>` : ''}
      <div class="itin-clock-panel">
        <div class="itin-clock-face" aria-hidden="true">
          <div class="itin-clock-hand" id="mClockHand"></div>
          <div class="itin-clock-center"></div>
          <span class="itin-clock-digit" style="--i:0">12</span>
          <span class="itin-clock-digit" style="--i:1">3</span>
          <span class="itin-clock-digit" style="--i:2">6</span>
          <span class="itin-clock-digit" style="--i:3">9</span>
        </div>
        <div class="itin-clock-controls">
          <label class="itin-clock-input-label">시계로 선택
            <input id="mClock" type="time" value="${esc(clockValue)}">
          </label>
          <label class="itin-tilde"><input id="mTilde" type="checkbox" ${hasTilde || (!initialTime && prev) ? 'checked' : ''}> 이후(~) 표시</label>
          <div class="itin-chip-row">
            <button type="button" class="itin-chip" data-set-time="오전">오전</button>
            <button type="button" class="itin-chip" data-set-time="낮">낮</button>
            <button type="button" class="itin-chip" data-set-time="오후">오후</button>
            <button type="button" class="itin-chip" data-set-time="저녁">저녁</button>
            <button type="button" class="itin-chip" data-set-time="밤">밤</button>
            <button type="button" class="itin-chip" data-set-time="늦잠">늦잠</button>
          </div>
        </div>
      </div>
      <label>표시될 시간<input id="mTime" type="text" maxlength="40" value="${esc(initialTime || (!item && prevMins != null ? formatClock(prevMins + 60, true) : ''))}" placeholder="예: 14:00~ 또는 오전"></label>
    </div>
  `;
}

function bindTimeField(el) {
  const timeInput = el.querySelector('#mTime');
  const clock = el.querySelector('#mClock');
  const tilde = el.querySelector('#mTilde');
  const hand = el.querySelector('#mClockHand');

  const syncHand = (mins) => {
    if (!hand || mins == null) return;
    // 12시간제 시침 각도 (분 반영)
    const hours12 = (Math.floor(mins / 60) % 12) + (mins % 60) / 60;
    const deg = hours12 * 30;
    hand.style.transform = `translate(-50%, -100%) rotate(${deg}deg)`;
  };

  const applyClockToText = () => {
    if (!clock?.value) return;
    const [h, m] = clock.value.split(':').map(Number);
    if (Number.isNaN(h) || Number.isNaN(m)) return;
    const mins = h * 60 + m;
    const text = formatClock(mins, Boolean(tilde?.checked));
    if (timeInput) timeInput.value = text;
    syncHand(mins);
  };

  const applyTextToClock = () => {
    const mins = parseClockMinutes(timeInput?.value || '');
    if (mins == null || !clock) return;
    clock.value = minutesToTimeValue(mins);
    if (tilde) tilde.checked = /~$/.test(String(timeInput.value || '').trim());
    syncHand(mins);
  };

  clock?.addEventListener('input', applyClockToText);
  clock?.addEventListener('change', applyClockToText);
  tilde?.addEventListener('change', () => {
    const mins = parseClockMinutes(timeInput?.value || clock?.value || '');
    if (mins != null && timeInput) {
      timeInput.value = formatClock(mins, Boolean(tilde.checked));
      syncHand(mins);
    } else {
      applyClockToText();
    }
  });
  timeInput?.addEventListener('change', applyTextToClock);

  el.querySelectorAll('[data-set-time]').forEach(btn => {
    btn.addEventListener('click', () => {
      const v = btn.getAttribute('data-set-time') || '';
      if (!timeInput) return;
      if (/^\d{1,2}:\d{2}$/.test(v)) {
        timeInput.value = tilde?.checked ? `${v}~` : v;
        if (clock) clock.value = v;
        syncHand(parseClockMinutes(v));
      } else {
        timeInput.value = v;
        const mins = parseClockMinutes(v);
        if (mins != null && clock) {
          clock.value = minutesToTimeValue(mins);
          syncHand(mins);
        }
      }
    });
  });

  // 초기 표시
  const initMins = parseClockMinutes(timeInput?.value || clock?.value || '');
  if (initMins != null) syncHand(initMins);
  else if (clock?.value) applyClockToText();
}

function openItemEditor(dayId, item) {
  const isNew = !item;
  const data = item || {
    time: '',
    place: '',
    task: '',
    note: '',
    imageUrl: '',
    placeMapsUrl: ''
  };
  const { wrap, close, el } = modal(`
    <h3>${isNew ? '일정 추가' : '일정 수정'}</h3>
    ${buildTimeFieldHtml(dayId, item, data.time || '')}
    <label>장소<input id="mPlace" type="text" maxlength="120" value="${esc(data.place || '')}" placeholder="장소 이름"></label>
    <div class="itin-place-row">
      <button type="button" class="itin-btn" id="mMapsSearch">구글 지도에서 찾기</button>
      <button type="button" class="itin-btn" id="mMapsPaste">지도 링크 붙이기</button>
    </div>
    <label>지도 링크<input id="mMaps" type="url" value="${esc(data.placeMapsUrl || '')}" placeholder="https://maps.google.com/..."></label>
    <label>할 일 / 제목<input id="mTask" type="text" maxlength="160" value="${esc(data.task || '')}"></label>
    <label>메모<textarea id="mNote" rows="4" maxlength="800">${esc(data.note || '')}</textarea></label>
    ${localImagePickerHtml('mImgUrl')}
    <label>또는 사진 URL<input id="mImgUrl" type="text" value="${esc(data.imageUrl || '')}" placeholder="https://...jpg (선택)"></label>
    <div id="mImgUrlPreview" class="itin-item-photo itin-preview" hidden>
      <img alt="미리보기" referrerpolicy="no-referrer" onerror="var p=this.parentElement;if(p)p.classList.add('is-broken')">
      <div class="itin-photo-fail">미리보기가 안 되면 저장해도 화면에 안 나올 수 있어요.</div>
    </div>
    <p class="tiny" style="margin:0 0 8px">카톡/블로그 글 주소는 안 됩니다. 이미지 직접 링크(.jpg) 또는 위 썸네일을 선택하세요.</p>
    <div class="itin-modal-actions">
      <button type="button" class="itin-btn" data-cancel>취소</button>
      <button type="button" class="itin-btn primary" data-save>저장</button>
    </div>
  `);

  bindTimeField(el);
  bindImageFields(el, 'mImgUrl');
  el.querySelector('#mMapsSearch').onclick = () => {
    const place = el.querySelector('#mPlace').value.trim();
    const url = mapsUrlFor(place || 'Kota Kinabalu', '');
    window.open(url, '_blank', 'noopener');
  };
  el.querySelector('#mMapsPaste').onclick = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (/maps\.google|goo\.gl\/maps|google\.[^/]+\/maps/i.test(text)) {
        el.querySelector('#mMaps').value = text.trim();
      } else {
        alert('클립보드에 구글 지도 링크를 복사한 뒤 다시 눌러 주세요.');
      }
    } catch (_) {
      alert('클립보드를 읽을 수 없습니다. 지도 링크를 직접 붙여넣기 하세요.');
    }
  };
  el.querySelector('[data-cancel]').onclick = close;
  el.querySelector('[data-save]').onclick = async () => {
    try {
      const imageUrl = assertImageUrlOrEmpty(el.querySelector('#mImgUrl').value, false);
      const place = el.querySelector('#mPlace').value.trim().slice(0, 120);
      const placeMapsUrl = el.querySelector('#mMaps').value.trim() || mapsUrlFor(place, '');
      const payload = {
        day: dayId,
        time: el.querySelector('#mTime').value.trim().slice(0, 40),
        place,
        task: el.querySelector('#mTask').value.trim().slice(0, 160),
        note: el.querySelector('#mNote').value.trim().slice(0, 800),
        imageUrl,
        placeMapsUrl,
        updatedBy: ctx.nickname,
        updatedAt: serverTimestamp()
      };
      if (!payload.task && !payload.place) throw new Error('장소 또는 할 일을 입력해 주세요.');

      if (isNew) {
        const list = itemsByDay[dayId] || [];
        payload.order = list.length;
        const ref = await addDoc(collection(ctx.db, 'trips', ctx.tripCode, 'items'), payload);
        const bits = [
          payload.time && `시간 ${payload.time}`,
          payload.place && `장소 ${payload.place}`,
          payload.task && `할 일 ${payload.task}`,
          payload.note && '메모 있음',
          payload.imageUrl && '사진 있음'
        ].filter(Boolean);
        await logItinEvent({
          kind: 'add',
          day: dayId,
          itemId: ref.id,
          summary: `${DAY_LABEL[dayId] || dayId} ${kindLabel('add')}: ${itemSummary(payload)}`,
          detail: bits.join(' · ') || itemSummary(payload)
        });
      } else {
        payload.order = item.order || 0;
        const detail = diffItemFields(item, payload) || '내용 저장';
        await updateDoc(doc(ctx.db, 'trips', ctx.tripCode, 'items', item.id), payload);
        await logItinEvent({
          kind: 'edit',
          day: dayId,
          itemId: item.id,
          summary: `${DAY_LABEL[dayId] || dayId} ${kindLabel('edit')}: ${itemSummary(payload)}`,
          detail
        });
      }
      close();
    } catch (e) {
      alert(e.message || '저장 실패');
    }
  };
}

export async function attachItineraryRoom(nextCtx) {
  ctx = nextCtx;
  if (!canEdit()) {
    clearUnsubs();
    renderReadonlyDefaults();
    return;
  }
  try {
    await seedItinerary();
    bindLive();
    if (hint) hint.textContent = `여행방 ${ctx.tripCode} · 일정 공동 편집 모드`;
  } catch (e) {
    console.error(e);
    if (hint) hint.textContent = `일정 동기화 실패: ${e.message || e}`;
    renderReadonlyDefaults();
  }
}

export function detachItineraryRoom() {
  clearUnsubs();
  ctx = null;
  dayMeta = {};
  itemsByDay = { day1: [], day2: [], day3: [], day4: [] };
  renderReadonlyDefaults();
}

/** AI 채팅용 일정 읽기/쓰기 API */
export function getItineraryApi() {
  return {
    canEdit: () => canEdit(),
    nickname: () => ctx?.nickname || '',
    tripCode: () => ctx?.tripCode || '',
    getSnapshot() {
      const days = ['day1', 'day2', 'day3', 'day4'].map(id => {
        const fallback = DEFAULT_DAYS.find(d => d.id === id);
        const meta = dayMeta[id] || fallback || {};
        const items = (itemsByDay[id] || []).map(it => ({
          id: it.id,
          time: it.time || '',
          place: it.place || '',
          task: it.task || '',
          note: it.note || '',
          imageUrl: it.imageUrl || '',
          placeMapsUrl: it.placeMapsUrl || '',
          order: it.order || 0
        }));
        return {
          id,
          label: DAY_LABEL[id] || id,
          badge: meta.badge || fallback?.badge || '',
          title: meta.title || fallback?.title || '',
          subtitle: meta.subtitle || fallback?.subtitle || '',
          items
        };
      });
      return {
        editable: canEdit(),
        tripCode: ctx?.tripCode || '',
        nickname: ctx?.nickname || '',
        days
      };
    },
    async addItem({
      day,
      time = '',
      place = '',
      task = '',
      note = '',
      imageUrl = '',
      placeMapsUrl = '',
      source = 'AI 추가'
    }) {
      if (!canEdit()) throw new Error('여행방에 입장해야 일정을 수정할 수 있어요.');
      const dayId = String(day || '');
      if (!/^day[1-4]$/.test(dayId)) throw new Error('day는 day1~day4 중 하나여야 해요.');
      const payload = {
        day: dayId,
        order: (itemsByDay[dayId] || []).length,
        time: String(time || '').slice(0, 40),
        place: String(place || '').slice(0, 120),
        task: String(task || '').slice(0, 160),
        note: String(note || '').slice(0, 800),
        imageUrl: normalizeImageUrl(imageUrl || ''),
        placeMapsUrl: String(placeMapsUrl || '').trim() || mapsUrlFor(place, ''),
        updatedBy: ctx.nickname,
        updatedAt: serverTimestamp()
      };
      if (!payload.task && !payload.place) throw new Error('장소 또는 할 일이 필요해요.');
      const ref = await addDoc(collection(ctx.db, 'trips', ctx.tripCode, 'items'), payload);
      await logItinEvent({
        kind: 'add',
        day: dayId,
        itemId: ref.id,
        summary: `${DAY_LABEL[dayId] || dayId} ${kindLabel('add')}: ${itemSummary(payload)}`,
        detail: `${String(source || 'AI 추가').slice(0, 40)} · ${itemSummary(payload)}`
      });
      return { id: ref.id, ...payload, updatedAt: null };
    },
    async updateItem(itemId, patch = {}) {
      if (!canEdit()) throw new Error('여행방에 입장해야 일정을 수정할 수 있어요.');
      const prev = findItem(itemId);
      if (!prev) throw new Error('해당 일정을 찾지 못했어요.');
      const next = {
        time: patch.time != null ? String(patch.time).slice(0, 40) : (prev.time || ''),
        place: patch.place != null ? String(patch.place).slice(0, 120) : (prev.place || ''),
        task: patch.task != null ? String(patch.task).slice(0, 160) : (prev.task || ''),
        note: patch.note != null ? String(patch.note).slice(0, 800) : (prev.note || ''),
        imageUrl: patch.imageUrl != null ? normalizeImageUrl(patch.imageUrl) : (prev.imageUrl || ''),
        placeMapsUrl: patch.placeMapsUrl != null
          ? String(patch.placeMapsUrl).trim()
          : (prev.placeMapsUrl || '')
      };
      if (!next.placeMapsUrl) next.placeMapsUrl = mapsUrlFor(next.place, '');
      if (!next.task && !next.place) throw new Error('장소 또는 할 일이 필요해요.');
      const detail = diffItemFields(prev, next) || 'AI 수정';
      await updateDoc(doc(ctx.db, 'trips', ctx.tripCode, 'items', itemId), {
        ...next,
        day: prev.day,
        order: prev.order || 0,
        updatedBy: ctx.nickname,
        updatedAt: serverTimestamp()
      });
      await logItinEvent({
        kind: 'edit',
        day: prev.day,
        itemId,
        summary: `${DAY_LABEL[prev.day] || prev.day} ${kindLabel('edit')}: ${itemSummary(next)}`,
        detail: `AI 수정 · ${detail}`
      });
      return { id: itemId, day: prev.day, ...next };
    },
    async deleteItem(itemId) {
      if (!canEdit()) throw new Error('여행방에 입장해야 일정을 수정할 수 있어요.');
      const prev = findItem(itemId);
      if (!prev) throw new Error('해당 일정을 찾지 못했어요.');
      await deleteDoc(doc(ctx.db, 'trips', ctx.tripCode, 'items', itemId));
      await logItinEvent({
        kind: 'delete',
        day: prev.day,
        itemId,
        summary: `${DAY_LABEL[prev.day] || prev.day} ${kindLabel('delete')}: ${itemSummary(prev)}`,
        detail: `AI 삭제 · ${itemSummary(prev)}`
      });
      return { id: itemId, deleted: true };
    }
  };
}

// initial paint
renderReadonlyDefaults();
