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
import {
  getStorage,
  ref as storageRef,
  uploadBytes,
  getDownloadURL
} from 'https://www.gstatic.com/firebasejs/11.6.0/firebase-storage.js';
import { DEFAULT_DAYS } from './itinerary-data.js';

const root = document.getElementById('itineraryApp');
const hint = document.getElementById('itinEditHint');
if (!root) {
  // section not present
}

let ctx = null; // { db, storage, tripCode, nickname }
let unsubs = [];
let activeDay = 'day1';
let dayMeta = {};
let itemsByDay = { day1: [], day2: [], day3: [], day4: [] };
let dragId = null;
let editable = false;

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

function mapsUrlFor(place, existing) {
  if (existing) return existing;
  const q = String(place || '').trim();
  if (!q) return '';
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
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
    hint.textContent = '여행방에 입장하면 일정을 함께 수정·드래그·사진 업로드할 수 있어요.';
  }
  root.innerHTML = buildShellHtml(DEFAULT_DAYS.map(d => ({
    meta: d,
    items: d.items.map((it, i) => ({ id: `${d.id}-${i}`, ...it, order: i }))
  })));
  bindTabs();
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
        <div class="day-photo">
          <img src="${esc(meta.coverUrl || './images/kkia-airport.jpg')}" alt="${esc(meta.title || '')}" loading="lazy">
        </div>
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

function renderItem(item, dayId) {
  const maps = item.placeMapsUrl || mapsUrlFor(item.place, '');
  return `
    <li class="itin-item ${editable ? 'is-editable' : ''}" data-item-id="${esc(item.id)}" draggable="${editable ? 'true' : 'false'}">
      ${editable ? '<div class="itin-drag" aria-hidden="true">⋮⋮</div>' : ''}
      <div class="t-time">${esc(item.time || '')}</div>
      <div class="t-body">
        <div class="t-place">${esc(item.place || '')}</div>
        <div class="t-task">${esc(item.task || '')}</div>
        ${item.note ? `<div class="t-note">${esc(item.note).replace(/\n/g, '<br>')}</div>` : ''}
        ${item.imageUrl ? `<div class="itin-item-photo"><img src="${esc(item.imageUrl)}" alt="" loading="lazy"></div>` : ''}
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

function render() {
  if (!root) return;
  editable = canEdit();
  if (hint) {
    hint.hidden = false;
    hint.textContent = editable
      ? `여행방 ${ctx.tripCode} · ${ctx.nickname}님, 일정을 함께 수정할 수 있어요.`
      : '여행방에 입장하면 일정을 함께 수정·드래그·사진 업로드할 수 있어요.';
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
        await deleteDoc(doc(ctx.db, 'trips', ctx.tripCode, 'items', btn.dataset.delItem));
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

async function compressImage(file, maxW = 1400) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxW / bitmap.width);
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const g = canvas.getContext('2d');
  g.drawImage(bitmap, 0, 0, w, h);
  const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.82));
  return blob || file;
}

async function uploadImage(file, path) {
  if (!ctx.storage) throw new Error('Storage가 준비되지 않았습니다.');
  const blob = await compressImage(file);
  const ref = storageRef(ctx.storage, path);
  await uploadBytes(ref, blob, { contentType: 'image/jpeg' });
  return getDownloadURL(ref);
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
      await setDoc(doc(ctx.db, 'trips', ctx.tripCode, 'dayMeta', dayId), {
        badge: el.querySelector('#mBadge').value.trim().slice(0, 40),
        title: el.querySelector('#mTitle').value.trim().slice(0, 80),
        subtitle: el.querySelector('#mSub').value.trim().slice(0, 160),
        coverUrl: meta.coverUrl || '',
        updatedBy: ctx.nickname,
        updatedAt: serverTimestamp()
      }, { merge: true });
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
    <label>이미지 URL<input id="mUrl" type="url" value="${esc(meta.coverUrl || '')}" placeholder="https://..."></label>
    <label>또는 업로드<input id="mFile" type="file" accept="image/*"></label>
    <div class="itin-modal-actions">
      <button type="button" class="itin-btn" data-cancel>취소</button>
      <button type="button" class="itin-btn primary" data-save>저장</button>
    </div>
  `);
  el.querySelector('[data-cancel]').onclick = close;
  el.querySelector('[data-save]').onclick = async () => {
    try {
      let url = el.querySelector('#mUrl').value.trim();
      const file = el.querySelector('#mFile').files?.[0];
      if (file) {
        url = await uploadImage(file, `trips/${ctx.tripCode}/covers/${dayId}-${Date.now()}.jpg`);
      }
      if (!url) throw new Error('URL 또는 파일을 넣어 주세요.');
      await setDoc(doc(ctx.db, 'trips', ctx.tripCode, 'dayMeta', dayId), {
        badge: meta.badge || '',
        title: meta.title || '',
        subtitle: meta.subtitle || '',
        coverUrl: url,
        updatedBy: ctx.nickname,
        updatedAt: serverTimestamp()
      }, { merge: true });
      close();
    } catch (e) {
      alert(e.message || '저장 실패');
    }
  };
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
    <label>시간<input id="mTime" type="text" maxlength="40" value="${esc(data.time || '')}" placeholder="예: 14:00 또는 오전"></label>
    <label>장소<input id="mPlace" type="text" maxlength="120" value="${esc(data.place || '')}" placeholder="장소 이름"></label>
    <div class="itin-place-row">
      <button type="button" class="itin-btn" id="mMapsSearch">구글 지도에서 찾기</button>
      <button type="button" class="itin-btn" id="mMapsPaste">지도 링크 붙이기</button>
    </div>
    <label>지도 링크<input id="mMaps" type="url" value="${esc(data.placeMapsUrl || '')}" placeholder="https://maps.google.com/..."></label>
    <label>할 일 / 제목<input id="mTask" type="text" maxlength="160" value="${esc(data.task || '')}"></label>
    <label>메모<textarea id="mNote" rows="4" maxlength="800">${esc(data.note || '')}</textarea></label>
    <label>사진 URL<input id="mImgUrl" type="url" value="${esc(data.imageUrl || '')}" placeholder="https://..."></label>
    <label>또는 사진 업로드<input id="mImgFile" type="file" accept="image/*"></label>
    <div class="itin-modal-actions">
      <button type="button" class="itin-btn" data-cancel>취소</button>
      <button type="button" class="itin-btn primary" data-save>저장</button>
    </div>
  `);

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
      let imageUrl = el.querySelector('#mImgUrl').value.trim();
      const file = el.querySelector('#mImgFile').files?.[0];
      if (file) {
        imageUrl = await uploadImage(file, `trips/${ctx.tripCode}/items/${Date.now()}.jpg`);
      }
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
        await addDoc(collection(ctx.db, 'trips', ctx.tripCode, 'items'), payload);
      } else {
        payload.order = item.order || 0;
        await updateDoc(doc(ctx.db, 'trips', ctx.tripCode, 'items', item.id), payload);
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

// initial paint
renderReadonlyDefaults();
