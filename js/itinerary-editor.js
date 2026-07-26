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

const root = document.getElementById('itineraryApp');
const hint = document.getElementById('itinEditHint');
if (!root) {
  // section not present
}

let ctx = null; // { db, tripCode, nickname }
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

const LOCAL_IMAGES = [
  { label: '공항', url: './images/kkia-airport.jpg' },
  { label: '노을1', url: './images/kk-sunset.jpg' },
  { label: '노을2', url: './images/kk-sunset-2.jpg' },
  { label: '노을3', url: './images/kk-sunset-3.jpg' },
  { label: '노을4', url: './images/kk-sunset-4.jpg' },
  { label: '노을5', url: './images/kk-sunset-5.jpg' },
  { label: '탄중아루', url: './images/tanjung-aru-islands.jpg' },
  { label: '마누칸', url: './images/manukan-beach.jpg' },
  { label: '섬전경', url: './images/kk-islands.jpg' },
  { label: '맹그로브', url: './images/mangrove-boat.jpg' },
  { label: '가야마켓', url: './images/gaya-market.jpg' },
  { label: '키나발루산', url: './images/mount-kinabalu.jpg' },
  { label: '보트', url: './images/kk-tanjung-boat.jpg' },
  { label: '해양액티비티', url: './images/kk-sea-activity.jpg' },
  { label: '마누칸선착장', url: './images/manukan-jetty.jpg' },
  { label: '마누칸뷰', url: './images/manukan-view.jpg' },
  { label: '마무틱·술룩', url: './images/mamutik-sulug.jpg' },
  { label: '제트스키', url: './images/kk-jetski.jpg' }
];

/** 공유 페이지 링크를 img에서 쓸 수 있는 직접 주소로 변환 */
function normalizeImageUrl(raw) {
  const input = String(raw || '').trim();
  if (!input) return '';
  let url = input.replace(/^<|>$/g, '').trim();

  // Google Drive: /file/d/ID/view 또는 open?id=ID
  const driveFile = url.match(/drive\.google\.com\/file\/d\/([^/]+)/i);
  if (driveFile) {
    return `https://drive.google.com/uc?export=view&id=${driveFile[1]}`;
  }
  const driveOpen = url.match(/drive\.google\.com\/open\?[^#]*id=([^&]+)/i);
  if (driveOpen) {
    return `https://drive.google.com/uc?export=view&id=${decodeURIComponent(driveOpen[1])}`;
  }
  const driveUc = url.match(/drive\.google\.com\/uc\?[^#]*id=([^&]+)/i);
  if (driveUc && !/export=/i.test(url)) {
    return `https://drive.google.com/uc?export=view&id=${decodeURIComponent(driveUc[1])}`;
  }

  // Dropbox 공유 링크 → 직접 파일
  if (/dropbox\.com\//i.test(url)) {
    url = url.replace(/([?&])dl=0/, '$1dl=1');
    if (!/[?&]dl=/.test(url)) {
      url += (url.includes('?') ? '&' : '?') + 'raw=1';
    }
  }

  // i.imgur.com 은 그대로, imgur 페이지면 .jpg 시도는 하지 않음(불확실)
  return url;
}

function looksLikeDirectImageUrl(url) {
  if (!url) return false;
  if (url.startsWith('./') || url.startsWith('/')) return true;
  if (/\.(jpe?g|png|gif|webp|avif)(\?|#|$)/i.test(url)) return true;
  if (/drive\.google\.com\/uc\?/i.test(url)) return true;
  if (/googleusercontent\.com|ggpht\.com|imgur\.com|cloudinary\.com|unsplash\.com|images\.unsplash\.com/i.test(url)) return true;
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
    ${localImagePickerHtml('mImgUrl')}
    <label>또는 사진 URL<input id="mImgUrl" type="text" value="${esc(data.imageUrl || '')}" placeholder="https://...jpg (선택)"></label>
    <div id="mImgUrlPreview" class="itin-item-photo itin-preview" hidden>
      <img alt="미리보기" referrerpolicy="no-referrer" onerror="this.closest('.itin-item-photo')?.classList.add('is-broken')">
      <div class="itin-photo-fail">미리보기가 안 되면 저장해도 화면에 안 나올 수 있어요.</div>
    </div>
    <p class="tiny" style="margin:0 0 8px">카톡/블로그 글 주소 ❌ · 이미지 직접 링크(.jpg) 또는 위 썸네일 선택 ✅</p>
    <div class="itin-modal-actions">
      <button type="button" class="itin-btn" data-cancel>취소</button>
      <button type="button" class="itin-btn primary" data-save>저장</button>
    </div>
  `);

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
