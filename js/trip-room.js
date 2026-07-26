import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.6.0/firebase-app.js';
import {
  getAuth,
  signInAnonymously,
  onAuthStateChanged
} from 'https://www.gstatic.com/firebasejs/11.6.0/firebase-auth.js';
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  collection,
  addDoc,
  getDocs,
  onSnapshot,
  query,
  orderBy,
  serverTimestamp,
  writeBatch
} from 'https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js';
import { firebaseConfig, isFirebaseConfigured } from './firebase-config.js';
import { attachItineraryRoom, detachItineraryRoom, logTripActivity } from './itinerary-editor.js';
import { attachGuideContentRoom, detachGuideContentRoom } from './guide-content.js';

const STORAGE_KEY = 'kk-trip-room-session';
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const MAX_NOTES = 40;
const TITLE_BASE = '코타키나발루 · 라사 리아 4일';
const ADMIN_NICKNAME = '은섹젤';

function readKey(code) {
  return `kk-trip-read-${code}`;
}

function seenKey(code) {
  return `kk-trip-seen-${code}`;
}

const DEFAULT_PACK = [
  '여권 · 항공 e-티켓 · 숙소 예약 확인서(픽업·입국 대비)',
  '국제운전면허(렌트 시) / 여행자보험 증권',
  '멀티어댑터(말레이시아 Type G 3구) · 보조배터리',
  '선크림 SPF50 · 모자 · 선글라스',
  '수영복 · 래시가드 · 아쿠아슈즈 · 마이크로파이버 타월',
  '방수팩 / 지퍼백 · 여벌 속옷·양말',
  '모기 기피제 · 얇은 긴팔·긴바지(반딧불이용)',
  '상비약(해열진통·소화·밴드·멀미약)',
  '현금 소액 MYR + 카드 1~2장',
  '우산 또는 가벼운 우비 · 슬리퍼',
  '수면안대·귀마개(가는 편 야간 비행)',
  '드라이백 / 휴대폰 방수 케이스(호핑)'
];

const DEFAULT_TASKS = [
  'KE5761 좌석·수하물 확인 · 인천 T2 체크인 시간 메모',
  '귀국편 예약 (추천: KE5762 8/17 00:35경)',
  '라사 리아 공항 픽업 예약 (항공편·인원·캐리어 수 전달)',
  '리조트 Activity Desk에 8/14 반딧불이(Sunset+Fireflies) 예약',
  '8/15 호핑투어 예약 + 리조트→제티 픽업 시간 확정',
  '시내 마사지 대략 시간대 예약(호핑 후 19:30~)',
  '귀국일 리조트→공항 차량 예약',
  '늦은 비행 대비 Napzone KKIA 또는 에어로포드 짧게 예약',
  '호핑투어(South Jetty / Jesselton Quay) + 리조트→시내 픽업 시간 확정'
];

const el = {
  root: document.getElementById('tripRoom'),
  setup: document.getElementById('tripSetup'),
  gate: document.getElementById('tripGate'),
  room: document.getElementById('tripRoomPanel'),
  needJoin: document.getElementById('tripNeedJoin'),
  session: document.getElementById('tripSessionPanel'),
  settings: document.getElementById('settings'),
  settingsFold: document.getElementById('tripSettingsFold'),
  settingsSummary: document.getElementById('tripSettingsSummary'),
  nick: document.getElementById('tripNickname'),
  code: document.getElementById('tripJoinCode'),
  createBtn: document.getElementById('tripCreateBtn'),
  joinBtn: document.getElementById('tripJoinBtn'),
  leaveBtn: document.getElementById('tripLeaveBtn'),
  copyBtn: document.getElementById('tripCopyBtn'),
  shareBtn: document.getElementById('tripShareBtn'),
  codeLabel: document.getElementById('tripCodeLabel'),
  members: document.getElementById('tripMembers'),
  status: document.getElementById('tripStatus'),
  packList: document.getElementById('tripPackList'),
  taskList: document.getElementById('tripTaskList'),
  noteList: document.getElementById('tripNoteList'),
  packInput: document.getElementById('tripPackInput'),
  taskInput: document.getElementById('tripTaskInput'),
  noteInput: document.getElementById('tripNoteInput'),
  packAdd: document.getElementById('tripPackAdd'),
  taskAdd: document.getElementById('tripTaskAdd'),
  noteAdd: document.getElementById('tripNoteAdd'),
  tabs: document.querySelectorAll('[data-trip-tab]'),
  panes: document.querySelectorAll('[data-trip-pane]')
};

let app = null;
let auth = null;
let db = null;
let uid = null;
let nickname = '';
let tripCode = '';
let unsubs = [];
let lastReadAt = 0;
let seenSet = new Set();
let dataCache = { pack: [], tasks: [], notes: [], itin: [] };
const unreadBanner = document.getElementById('tripUnreadBanner');
const unreadText = document.getElementById('tripUnreadText');
const markReadBtn = document.getElementById('tripMarkReadBtn');
const roomUnreadCount = document.getElementById('tripRoomUnreadCount');

function setStatus(msg, isError = false) {
  if (!el.status) return;
  el.status.textContent = msg || '';
  el.status.classList.toggle('is-error', Boolean(isError && msg));
}

function toMs(value) {
  if (!value) return 0;
  if (typeof value.toDate === 'function') return value.toDate().getTime();
  if (typeof value.seconds === 'number') return value.seconds * 1000;
  if (typeof value === 'number') return value;
  return 0;
}

function myNick() {
  return String(nickname || '').trim();
}

function loadSeen(code) {
  try {
    const arr = JSON.parse(localStorage.getItem(seenKey(code)) || '[]');
    seenSet = new Set(Array.isArray(arr) ? arr : []);
  } catch (_) {
    seenSet = new Set();
  }
  lastReadAt = Number(localStorage.getItem(readKey(code)) || 0);
}

function saveSeen() {
  if (!tripCode) return;
  localStorage.setItem(seenKey(tripCode), JSON.stringify([...seenSet]));
  localStorage.setItem(readKey(tripCode), String(Date.now()));
  lastReadAt = Date.now();
}

function noteFingerprint(docSnap) {
  const data = docSnap.data() || {};
  return `notes:${docSnap.id}:${toMs(data.createdAt)}:${data.text || ''}`;
}

function itemFingerprint(kind, docSnap) {
  const data = docSnap.data() || {};
  return `${kind}:${docSnap.id}:${toMs(data.updatedAt)}:${data.done ? 1 : 0}:${data.doneBy || ''}:${data.updatedBy || ''}:${data.text || ''}`;
}

function itinFingerprint(docSnap) {
  const data = docSnap.data() || {};
  return `itin:${docSnap.id}:${toMs(data.updatedAt)}:${data.kind || ''}:${data.summary || ''}:${data.detail || ''}`;
}

function itinKindLabel(kind) {
  return ({
    add: '추가',
    edit: '수정',
    delete: '삭제',
    reorder: '순서 변경',
    cover: '대표 사진',
    dayMeta: '하루 정보',
    hero: '메인 그림',
    food: '맛집',
    alt: '귀국 대안',
    pack: '준비물'
  })[kind] || '변경';
}

function formatItinWhen(data) {
  const ms = toMs(data?.updatedAt);
  if (!ms) return '';
  return new Date(ms).toLocaleString('ko-KR', {
    month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit'
  });
}

function unreadItinEvents() {
  if (!tripCode || !myNick()) return [];
  return dataCache.itin.filter(docSnap => isItinUnread(docSnap));
}

function highlightChangedItinItems() {
  const app = document.getElementById('itineraryApp');
  if (!app) return;
  app.querySelectorAll('.itin-item.is-changed').forEach(node => node.classList.remove('is-changed'));
  const ids = new Set(
    unreadItinEvents()
      .map(d => String((d.data() || {}).itemId || '').trim())
      .filter(Boolean)
  );
  app.querySelectorAll('.itin-item[data-item-id]').forEach(li => {
    if (ids.has(li.dataset.itemId)) li.classList.add('is-changed');
  });
}

window.refreshItinChangeHighlights = highlightChangedItinItems;

function renderItinChangeFeed() {
  const feed = document.getElementById('itinChangeFeed');
  const list = document.getElementById('itinChangeList');
  if (!feed || !list) return;

  const unread = unreadItinEvents().slice(0, 8);
  if (!unread.length) {
    feed.hidden = true;
    list.innerHTML = '';
    highlightChangedItinItems();
    return;
  }

  feed.hidden = false;
  list.innerHTML = '';
  unread.forEach(docSnap => {
    const data = docSnap.data() || {};
    const li = document.createElement('li');
    const kind = itinKindLabel(data.kind);
    const when = formatItinWhen(data);
    const summary = data.summary || '일정 변경';
    const detail = data.detail || summary;
    li.innerHTML = `
      <div class="itin-change-meta">
        <b></b>
        <span class="itin-change-kind"></span>
        <span class="itin-change-when"></span>
      </div>
      <div class="itin-change-summary"></div>
      <div class="itin-change-detail"></div>
    `;
    li.querySelector('b').textContent = data.updatedBy || '누군가';
    li.querySelector('.itin-change-kind').textContent = kind;
    li.querySelector('.itin-change-when').textContent = when;
    li.querySelector('.itin-change-summary').textContent = summary;
    li.querySelector('.itin-change-detail').textContent = detail;
    list.appendChild(li);
  });
  highlightChangedItinItems();
}

function isOtherNote(data) {
  const author = String(data?.author || '').trim();
  return Boolean(author && author !== myNick());
}

function isOtherItem(data) {
  const actor = String(data?.updatedBy || data?.doneBy || data?.createdBy || '').trim();
  return Boolean(actor && actor !== myNick());
}

function isOtherItin(data) {
  const actor = String(data?.updatedBy || '').trim();
  return Boolean(actor && actor !== myNick());
}

function isNoteUnread(docSnap) {
  const data = docSnap.data() || {};
  if (!isOtherNote(data)) return false;
  return !seenSet.has(noteFingerprint(docSnap));
}

function isItemUnread(kind, docSnap) {
  const data = docSnap.data() || {};
  if (!isOtherItem(data)) return false;
  return !seenSet.has(itemFingerprint(kind, docSnap));
}

function isItinUnread(docSnap) {
  const data = docSnap.data() || {};
  if (!isOtherItin(data)) return false;
  return !seenSet.has(itinFingerprint(docSnap));
}

function countUnreadByType() {
  const counts = { pack: 0, tasks: 0, notes: 0, itin: 0, total: 0 };
  if (!tripCode || !myNick()) return counts;

  dataCache.pack.forEach(docSnap => {
    if (isItemUnread('pack', docSnap)) counts.pack += 1;
  });
  dataCache.tasks.forEach(docSnap => {
    if (isItemUnread('tasks', docSnap)) counts.tasks += 1;
  });
  dataCache.notes.forEach(docSnap => {
    if (isNoteUnread(docSnap)) counts.notes += 1;
  });
  dataCache.itin.forEach(docSnap => {
    if (isItinUnread(docSnap)) counts.itin += 1;
  });
  counts.total = counts.pack + counts.tasks + counts.notes + counts.itin;
  return counts;
}

function setBadgeEl(elBadge, count) {
  if (!elBadge) return;
  const n = Math.max(0, Number(count) || 0);
  const label = n > 99 ? '99+' : String(n);
  elBadge.textContent = label;
  elBadge.classList.toggle('is-on', n > 0);
}

/** Android/Chrome 홈화면 앱 아이콘 숫자 뱃지 (Badging API) */
async function setHomeAppBadge(count) {
  const n = Math.max(0, Math.min(99, Number(count) || 0));
  try {
    if (n > 0) {
      if (navigator.setAppBadge) await navigator.setAppBadge(n);
    } else if (navigator.clearAppBadge) {
      await navigator.clearAppBadge();
    }
  } catch (_) {}

  try {
    const reg = await navigator.serviceWorker?.ready;
    reg?.active?.postMessage({ type: 'SET_APP_BADGE', count: n });
  } catch (_) {}
}

function clearUnreadUiNow() {
  document.querySelectorAll('[data-trip-badge], [data-tab-badge], [data-itin-badge]').forEach(badge => setBadgeEl(badge, 0));
  if (roomUnreadCount) {
    roomUnreadCount.textContent = '';
    roomUnreadCount.hidden = true;
  }
  if (unreadBanner && unreadText) {
    unreadText.textContent = '';
    unreadBanner.classList.remove('is-on');
  }
  document.title = TITLE_BASE;
  document.querySelectorAll('.trip-item.is-new, .trip-note.is-new').forEach(node => {
    node.classList.remove('is-new');
    node.querySelectorAll('.trip-new-tag').forEach(tag => tag.remove());
  });
  setHomeAppBadge(0);
}

function renderUnreadBadges() {
  const counts = countUnreadByType();
  const n = counts.total;
  const label = n > 99 ? '99+' : String(n);

  document.querySelectorAll('[data-trip-badge]').forEach(badge => setBadgeEl(badge, n));
  document.querySelectorAll('[data-itin-badge]').forEach(badge => setBadgeEl(badge, counts.itin));
  setBadgeEl(document.querySelector('[data-tab-badge="pack"]'), counts.pack);
  setBadgeEl(document.querySelector('[data-tab-badge="tasks"]'), counts.tasks);
  setBadgeEl(document.querySelector('[data-tab-badge="notes"]'), counts.notes);

  if (roomUnreadCount) {
    if (n > 0) {
      roomUnreadCount.hidden = false;
      roomUnreadCount.textContent = `안 본 ${label}`;
    } else {
      roomUnreadCount.hidden = true;
      roomUnreadCount.textContent = '';
    }
  }

  if (unreadBanner && unreadText) {
    if (n > 0) {
      const parts = [];
      if (counts.itin) parts.push(`변경 ${counts.itin}`);
      if (counts.pack) parts.push(`준비물 ${counts.pack}`);
      if (counts.tasks) parts.push(`출발 전 ${counts.tasks}`);
      if (counts.notes) parts.push(`공지 ${counts.notes}`);
      let text = `안 본 소식 ${label}개 (${parts.join(' · ')})`;
      if (counts.itin) {
        const latest = unreadItinEvents()[0]?.data() || {};
        const who = latest.updatedBy || '누군가';
        const bit = latest.summary || latest.detail || '';
        if (bit) text += ` · ${who}: ${bit}`;
      }
      unreadText.textContent = text;
      unreadBanner.classList.add('is-on');
    } else {
      unreadText.textContent = '';
      unreadBanner.classList.remove('is-on');
    }
  }

  renderItinChangeFeed();
  document.title = n > 0 ? `(${label}) ${TITLE_BASE}` : TITLE_BASE;
  setHomeAppBadge(n);
}

function refreshUnread({ rerender = false } = {}) {
  if (!tripCode) {
    renderUnreadBadges();
    return;
  }
  renderUnreadBadges();
  if (rerender) {
    renderChecklist(el.packList, dataCache.pack, 'packItems');
    renderChecklist(el.taskList, dataCache.tasks, 'taskItems');
    renderNotes(dataCache.notes);
  }
}

function captureAllAsSeen() {
  dataCache.pack.forEach(docSnap => seenSet.add(itemFingerprint('pack', docSnap)));
  dataCache.tasks.forEach(docSnap => seenSet.add(itemFingerprint('tasks', docSnap)));
  dataCache.notes.forEach(docSnap => seenSet.add(noteFingerprint(docSnap)));
  dataCache.itin.forEach(docSnap => seenSet.add(itinFingerprint(docSnap)));
  saveSeen();
}

function captureItinAsSeen() {
  dataCache.itin.forEach(docSnap => seenSet.add(itinFingerprint(docSnap)));
  saveSeen();
}

function markItinRead() {
  if (!tripCode || !dataCache.itin.length) {
    refreshUnread();
    return;
  }
  const before = countUnreadByType().itin;
  if (!before) return;
  captureItinAsSeen();
  refreshUnread();
}

function wireItinChangeFeedUi() {
  const btn = document.getElementById('itinMarkReadBtn');
  if (!btn || btn.dataset.bound === '1') return;
  btn.dataset.bound = '1';
  btn.addEventListener('click', event => {
    event.preventDefault();
    event.stopPropagation();
    markItinRead();
    setStatus('일정 변경을 확인했어요.');
  });
}

function markRead({ silent = false } = {}) {
  // Instant feedback first (button should feel immediate)
  clearUnreadUiNow();
  if (markReadBtn) {
    markReadBtn.textContent = '확인됨';
    markReadBtn.disabled = true;
  }

  captureAllAsSeen();
  refreshUnread({ rerender: true });

  if (!silent) setStatus('새 소식을 확인 처리했어요.');
  if (markReadBtn) {
    window.setTimeout(() => {
      markReadBtn.textContent = '확인했어요';
      markReadBtn.disabled = false;
    }, 700);
  }
}

function saveSession() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ nickname, tripCode }));
}

function loadSession() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
  } catch (_) {
    return null;
  }
}

function clearSession() {
  localStorage.removeItem(STORAGE_KEY);
}

function normalizeCode(raw) {
  return String(raw || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 6);
}

function makeCode() {
  let out = '';
  const arr = new Uint32Array(6);
  crypto.getRandomValues(arr);
  for (let i = 0; i < 6; i++) out += CODE_CHARS[arr[i] % CODE_CHARS.length];
  return out;
}

function refreshTripSettingsSummary() {
  if (!el.settingsSummary) return;
  if (tripCode && nickname) {
    el.settingsSummary.textContent = `입장 중 · ${tripCode} · ${nickname}`;
    el.settingsSummary.classList.add('is-ready');
    el.settingsSummary.classList.remove('is-missing');
  } else {
    el.settingsSummary.textContent = '미입장 · 펼쳐서 방 만들기/참여';
    el.settingsSummary.classList.add('is-missing');
    el.settingsSummary.classList.remove('is-ready');
  }
}

function openTripSettings() {
  if (el.settings) el.settings.open = true;
  if (el.settingsFold) el.settingsFold.open = true;
}

function showGate() {
  if (el.gate) el.gate.hidden = false;
  if (el.session) el.session.hidden = true;
  if (el.room) el.room.hidden = true;
  if (el.needJoin) el.needJoin.hidden = false;
  if (el.codeLabel) el.codeLabel.textContent = '------';
  refreshTripSettingsSummary();
}

function showRoom() {
  if (el.gate) el.gate.hidden = true;
  if (el.session) el.session.hidden = false;
  if (el.room) el.room.hidden = false;
  if (el.needJoin) el.needJoin.hidden = true;
  if (el.codeLabel) el.codeLabel.textContent = tripCode;
  refreshTripSettingsSummary();
  // 입장 후에는 함께 준비 본문을 보고, 설정 접기는 코드 관리용으로만 남김
  if (el.settingsFold) el.settingsFold.open = false;
}

function clearUnsubs() {
  unsubs.forEach(fn => {
    try { fn(); } catch (_) {}
  });
  unsubs = [];
}

async function ensureAuth() {
  if (!auth.currentUser) {
    await signInAnonymously(auth);
  }
  uid = auth.currentUser.uid;
  return uid;
}

async function seedList(colName, texts, creator) {
  if (!texts.length) return;
  const batch = writeBatch(db);
  const colRef = collection(db, 'trips', tripCode, colName);
  texts.forEach(text => {
    const ref = doc(colRef);
    batch.set(ref, {
      text,
      done: false,
      doneBy: null,
      createdBy: creator,
      updatedBy: creator,
      updatedAt: serverTimestamp()
    });
  });
  await batch.commit();
}

async function seedMissingTasks() {
  if (!tripCode) return;
  const snap = await getDocs(collection(db, 'trips', tripCode, 'taskItems'));
  const existing = new Set(snap.docs.map(d => (d.data().text || '').trim()));
  const missing = DEFAULT_TASKS.filter(text => !existing.has(text));
  if (!missing.length) {
    setStatus('출발 전 할 일 기본 목록이 이미 있어요.');
    return;
  }
  await seedList('taskItems', missing, nickname);
  setStatus(`출발 전 할 일 ${missing.length}개를 함께 준비에 넣었어요.`);
}

async function createRoom() {
  nickname = (el.nick.value || '').trim().slice(0, 24);
  if (nickname.length < 1) {
    setStatus('닉네임을 입력해 주세요.', true);
    return;
  }
  setStatus('방 만드는 중…');
  el.createBtn.disabled = true;
  try {
    await ensureAuth();
    let code = makeCode();
    for (let i = 0; i < 5; i++) {
      const exists = await getDoc(doc(db, 'trips', code));
      if (!exists.exists()) break;
      code = makeCode();
    }
    tripCode = code;
    await setDoc(doc(db, 'trips', tripCode), {
      code: tripCode,
      title: '코타키나발루 라사 리아',
      createdAt: serverTimestamp(),
      createdByNickname: nickname
    });
    await setDoc(doc(db, 'trips', tripCode, 'members', uid), {
      nickname,
      joinedAt: serverTimestamp()
    });
    await pruneDuplicateNicknames(nickname);
    await seedList('packItems', DEFAULT_PACK, nickname);
    await seedList('taskItems', DEFAULT_TASKS, nickname);
    saveSession();
    await enterRoom();
    setStatus('방을 만들었어요. 코드를 친구에게 공유하세요.');
  } catch (err) {
    console.error(err);
    setStatus(err.message || '방 만들기에 실패했습니다.', true);
  } finally {
    el.createBtn.disabled = false;
  }
}

async function joinRoom() {
  nickname = (el.nick.value || '').trim().slice(0, 24);
  const code = normalizeCode(el.code.value);
  if (nickname.length < 1) {
    setStatus('닉네임을 입력해 주세요.', true);
    return;
  }
  if (code.length !== 6) {
    setStatus('여행방 코드 6자리를 입력해 주세요.', true);
    return;
  }

  setStatus('참여하는 중…');
  el.joinBtn.disabled = true;
  try {
    await ensureAuth();
    const snap = await getDoc(doc(db, 'trips', code));
    if (!snap.exists()) {
      setStatus('방을 찾지 못했어요. 코드를 다시 확인해 주세요.', true);
      return;
    }
    tripCode = code;
    await setDoc(doc(db, 'trips', tripCode, 'members', uid), {
      nickname,
      joinedAt: serverTimestamp()
    }, { merge: true });
    await pruneDuplicateNicknames(nickname);
    saveSession();
    await enterRoom();
    setStatus(`${tripCode} 방에 입장했습니다.`);
  } catch (err) {
    console.error(err);
    setStatus(err.message || '참여에 실패했습니다.', true);
  } finally {
    el.joinBtn.disabled = false;
  }
}

function isAdmin() {
  return nickname === ADMIN_NICKNAME;
}

async function pruneDuplicateNicknames(nick) {
  if (!tripCode || !uid || !nick) return;
  try {
    const snap = await getDocs(collection(db, 'trips', tripCode, 'members'));
    const stale = snap.docs.filter(d => d.id !== uid && (d.data().nickname || '') === nick);
    await Promise.all(stale.map(d => deleteDoc(d.ref).catch(() => {})));
  } catch (_) {}
}

async function removeMember(memberUid, memberNick) {
  if (!tripCode || !memberUid) return;
  if (memberUid === uid) {
    setStatus('내 이름은 나가기로 정리하세요.', true);
    return;
  }
  if (!isAdmin()) {
    setStatus('어드민(은섹젤)만 다른 참가자를 삭제할 수 있어요.', true);
    return;
  }
  if (!confirm(`참가자 "${memberNick || '익명'}" 을(를) 목록에서 삭제할까요?`)) return;
  try {
    await deleteDoc(doc(db, 'trips', tripCode, 'members', memberUid));
    setStatus(`"${memberNick || '익명'}" 참가자를 삭제했어요.`);
  } catch (err) {
    console.error(err);
    setStatus(err.message || '참가자 삭제에 실패했습니다.', true);
  }
}

function renderMembers(docs) {
  el.members.innerHTML = '';
  const adminHint = document.getElementById('tripAdminHint');
  if (adminHint) adminHint.hidden = !isAdmin();

  docs.forEach(d => {
    const data = d.data();
    const nick = data.nickname || '익명';
    const chip = document.createElement('span');
    chip.className = 'trip-member';
    if (d.id === uid) chip.classList.add('is-me');
    if (nick === ADMIN_NICKNAME) chip.classList.add('is-admin');

    const nameEl = document.createElement('span');
    nameEl.textContent = nick;
    chip.appendChild(nameEl);

    if (isAdmin() && d.id !== uid) {
      const x = document.createElement('button');
      x.type = 'button';
      x.className = 'trip-member-x';
      x.setAttribute('aria-label', `${nick} 삭제`);
      x.textContent = '×';
      x.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        removeMember(d.id, nick);
      });
      chip.appendChild(x);
    }

    el.members.appendChild(chip);
  });
}

function renderChecklist(target, docs, colName) {
  target.innerHTML = '';
  if (!docs.length) {
    target.innerHTML = '<li class="trip-empty">항목이 없습니다. 아래에서 추가해 보세요.</li>';
    return;
  }
  const kind = colName === 'taskItems' ? 'tasks' : 'pack';
  docs.forEach(d => {
    const data = d.data();
    const unread = isItemUnread(kind, d);
    const li = document.createElement('li');
    li.className = 'trip-item' + (data.done ? ' is-done' : '') + (unread ? ' is-new' : '');
    li.innerHTML = `
      <label>
        <input type="checkbox" ${data.done ? 'checked' : ''} data-id="${d.id}" data-col="${colName}">
        <span class="trip-item-text"></span>
        ${unread ? '<span class="trip-new-tag">NEW</span>' : ''}
      </label>
      <div class="trip-item-meta">
        <span class="trip-who"></span>
        <button type="button" class="trip-del" data-id="${d.id}" data-col="${colName}" aria-label="삭제">삭제</button>
      </div>
    `;
    li.querySelector('.trip-item-text').textContent = data.text || '';
    const who = li.querySelector('.trip-who');
    const actor = data.updatedBy || data.doneBy || data.createdBy;
    if (data.done && data.doneBy) who.textContent = `✓ ${data.doneBy}`;
    else if (actor) who.textContent = actor;
    target.appendChild(li);
  });
}

function appendLinkedText(container, text) {
  const source = String(text || '');
  const urlRe = /(https?:\/\/[^\s<>"']+)/gi;
  let last = 0;
  let match;
  while ((match = urlRe.exec(source)) !== null) {
    if (match.index > last) {
      container.appendChild(document.createTextNode(source.slice(last, match.index)));
    }
    let href = match[1];
    // Trim common trailing punctuation from pasted links
    href = href.replace(/[),.;!?]+$/g, '');
    try {
      const parsed = new URL(href);
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
        const a = document.createElement('a');
        a.href = parsed.href;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        a.className = 'trip-note-link';
        a.textContent = href;
        container.appendChild(a);
        // If we trimmed punctuation, put it back as plain text
        const trimmed = match[1].slice(href.length);
        if (trimmed) container.appendChild(document.createTextNode(trimmed));
      } else {
        container.appendChild(document.createTextNode(match[1]));
      }
    } catch (_) {
      container.appendChild(document.createTextNode(match[1]));
    }
    last = match.index + match[1].length;
  }
  if (last < source.length) {
    container.appendChild(document.createTextNode(source.slice(last)));
  }
}

function renderNotes(docs) {
  el.noteList.innerHTML = '';
  if (!docs.length) {
    el.noteList.innerHTML = '<li class="trip-empty">아직 공지가 없습니다. 링크(https://…)도 같이 남겨 보세요.</li>';
    return;
  }
  docs.forEach(d => {
    const data = d.data();
    const unread = isNoteUnread(d);
    const li = document.createElement('li');
    li.className = 'trip-note' + (unread ? ' is-new' : '');
    const when = data.createdAt?.toDate ? data.createdAt.toDate() : null;
    const time = when
      ? when.toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
      : '방금';
    li.innerHTML = `
      <div class="trip-note-head">
        <strong></strong>
        ${unread ? '<span class="trip-new-tag">NEW</span>' : ''}
        <span></span>
        <button type="button" class="trip-del" data-id="${d.id}" data-col="notes" aria-label="삭제">삭제</button>
      </div>
      <p></p>
    `;
    li.querySelector('strong').textContent = data.author || '익명';
    li.querySelector('span:not(.trip-new-tag)').textContent = time;
    const body = li.querySelector('p');
    body.textContent = '';
    appendLinkedText(body, data.text || '');
    el.noteList.appendChild(li);
  });
}

async function enterRoom() {
  showRoom();
  const tripSection = document.getElementById('trip');
  if (tripSection) tripSection.open = true;
  clearUnsubs();
  loadSeen(tripCode);
  dataCache = { pack: [], tasks: [], notes: [], itin: [] };
  let pendingInitialSeen = seenSet.size === 0;
  const gotSnap = { pack: false, tasks: false, notes: false, itin: false };

  const afterDataSnap = kind => {
    gotSnap[kind] = true;
    if (pendingInitialSeen && gotSnap.pack && gotSnap.tasks && gotSnap.notes && gotSnap.itin) {
      captureAllAsSeen();
      pendingInitialSeen = false;
    }
    refreshUnread();
  };

  unsubs.push(onSnapshot(collection(db, 'trips', tripCode, 'members'), snap => {
    renderMembers(snap.docs);
  }));

  unsubs.push(onSnapshot(
    query(collection(db, 'trips', tripCode, 'packItems'), orderBy('text')),
    snap => {
      dataCache.pack = snap.docs;
      renderChecklist(el.packList, snap.docs, 'packItems');
      afterDataSnap('pack');
    }
  ));

  unsubs.push(onSnapshot(
    query(collection(db, 'trips', tripCode, 'taskItems'), orderBy('text')),
    snap => {
      dataCache.tasks = snap.docs;
      renderChecklist(el.taskList, snap.docs, 'taskItems');
      afterDataSnap('tasks');
    }
  ));

  unsubs.push(onSnapshot(
    query(collection(db, 'trips', tripCode, 'notes'), orderBy('createdAt', 'desc')),
    snap => {
      dataCache.notes = snap.docs;
      renderNotes(snap.docs);
      afterDataSnap('notes');
      // trim old notes beyond MAX_NOTES (best-effort by newest clients)
      if (snap.docs.length > MAX_NOTES) {
        snap.docs.slice(MAX_NOTES).forEach(extra => {
          deleteDoc(extra.ref).catch(() => {});
        });
      }
    }
  ));

  unsubs.push(onSnapshot(
    query(collection(db, 'trips', tripCode, 'itinEvents'), orderBy('updatedAt', 'desc')),
    snap => {
      dataCache.itin = snap.docs;
      afterDataSnap('itin');
      if (snap.docs.length > 40) {
        snap.docs.slice(40).forEach(extra => {
          deleteDoc(extra.ref).catch(() => {});
        });
      }
    },
    err => {
      console.warn('itinEvents listen failed', err);
      dataCache.itin = [];
      afterDataSnap('itin');
    }
  ));

  attachItineraryRoom({ db, tripCode, nickname }).catch(err => {
    console.error(err);
  });
  attachGuideContentRoom({ db, tripCode, nickname }).catch(err => {
    console.error(err);
  });
}

async function toggleItem(colName, id, checked) {
  const ref = doc(db, 'trips', tripCode, colName, id);
  await updateDoc(ref, {
    done: checked,
    doneBy: checked ? nickname : null,
    updatedBy: nickname,
    updatedAt: serverTimestamp()
  });
}

async function deleteItem(colName, id) {
  await deleteDoc(doc(db, 'trips', tripCode, colName, id));
}

async function addItem(colName, text) {
  const clean = text.trim().slice(0, 200);
  if (!clean) return;
  await addDoc(collection(db, 'trips', tripCode, colName), {
    text: clean,
    done: false,
    doneBy: null,
    createdBy: nickname,
    updatedBy: nickname,
    updatedAt: serverTimestamp()
  });
}

async function updateItemText(colName, id, text) {
  const clean = String(text || '').trim().slice(0, 200);
  if (!clean) throw new Error('내용이 비어 있어요.');
  await updateDoc(doc(db, 'trips', tripCode, colName, id), {
    text: clean,
    updatedBy: nickname,
    updatedAt: serverTimestamp()
  });
}

async function logPackActivity(action, text, itemId = '') {
  const act = ({ add: '추가', update: '수정', delete: '삭제' })[action] || action;
  const label = String(text || itemId || '준비물').slice(0, 80);
  await logTripActivity({
    kind: 'pack',
    day: 'pack',
    summary: `준비물 ${act}: ${label}`,
    detail: `${nickname} · 함께 준비`,
    itemId: String(itemId || '').slice(0, 80)
  });
}

export function getTripPackApi() {
  return {
    canEdit: () => Boolean(tripCode && nickname),
    tripCode: () => tripCode || '',
    nickname: () => nickname || '',
    getSnapshot() {
      return {
        editable: Boolean(tripCode && nickname),
        items: (dataCache.pack || []).map(d => ({
          id: d.id,
          text: d.data()?.text || '',
          done: Boolean(d.data()?.done)
        })),
        hint: '함께 준비 → 준비물. 수정/삭제는 itemId 사용.'
      };
    },
    async addPack(text) {
      if (!tripCode || !nickname) throw new Error('여행방에 입장해야 준비물을 수정할 수 있어요.');
      await addItem('packItems', text);
      await logPackActivity('add', text);
    },
    async updatePack(itemId, text) {
      if (!tripCode || !nickname) throw new Error('여행방에 입장해야 준비물을 수정할 수 있어요.');
      await updateItemText('packItems', itemId, text);
      await logPackActivity('update', text, itemId);
    },
    async deletePack(itemId) {
      if (!tripCode || !nickname) throw new Error('여행방에 입장해야 준비물을 수정할 수 있어요.');
      const prev = (dataCache.pack || []).find(d => d.id === itemId);
      const prevText = prev?.data()?.text || '';
      await deleteItem('packItems', itemId);
      await logPackActivity('delete', prevText, itemId);
    }
  };
}

async function addNote(text) {
  const clean = text.trim().slice(0, 500);
  if (!clean) return;
  await addDoc(collection(db, 'trips', tripCode, 'notes'), {
    text: clean,
    author: nickname,
    createdAt: serverTimestamp()
  });
}

async function leaveRoom() {
  clearUnsubs();
  if (tripCode && uid) {
    try {
      await deleteDoc(doc(db, 'trips', tripCode, 'members', uid));
    } catch (_) {}
  }
  tripCode = '';
  dataCache = { pack: [], tasks: [], notes: [] };
  clearSession();
  showGate();
  openTripSettings();
  renderUnreadBadges();
  detachItineraryRoom();
  detachGuideContentRoom();
  setStatus('방에서 나왔습니다. 설정에서 다시 입장할 수 있어요.');
}

async function copyCode() {
  try {
    await navigator.clipboard.writeText(tripCode);
    setStatus(`코드 ${tripCode} 를 복사했어요.`);
  } catch (_) {
    setStatus(`코드: ${tripCode}`, false);
  }
}

async function shareCode() {
  const url = `${location.origin}${location.pathname}?room=${encodeURIComponent(tripCode)}`;
  const payload = {
    title: '코타키나발루 여행방',
    text: [
      '코타키나발루 함께 준비방',
      `방 코드: ${tripCode}`,
      '',
      '1) 링크를 Chrome으로 열어 주세요 (카톡 안에서 열면 앱 설치가 안 됩니다)',
      '2) Chrome 메뉴(⋮) → 앱 설치 / 홈 화면에 추가',
      '3) 닉네임 입력 후 방 코드로 참여',
      '',
      url
    ].join('\n')
  };
  if (navigator.share) {
    try {
      await navigator.share({ title: payload.title, text: payload.text, url });
      return;
    } catch (_) {}
  }
  try {
    await navigator.clipboard.writeText(payload.text);
    setStatus('공유 문구를 복사했어요. 카톡에 붙여넣기 하세요.');
  } catch (_) {
    setStatus(`코드 ${tripCode}`, false);
  }
}

function bindUi() {
  el.createBtn?.addEventListener('click', createRoom);
  el.joinBtn?.addEventListener('click', joinRoom);
  el.leaveBtn?.addEventListener('click', leaveRoom);
  el.copyBtn?.addEventListener('click', copyCode);
  el.shareBtn?.addEventListener('click', shareCode);

  el.packAdd?.addEventListener('click', async () => {
    try {
      const text = el.packInput.value;
      await addItem('packItems', text);
      if (String(text || '').trim()) await logPackActivity('add', text);
      el.packInput.value = '';
    } catch (e) { setStatus(e.message, true); }
  });
  el.taskAdd?.addEventListener('click', async () => {
    try {
      await addItem('taskItems', el.taskInput.value);
      el.taskInput.value = '';
    } catch (e) { setStatus(e.message, true); }
  });
  el.noteAdd?.addEventListener('click', async () => {
    try {
      await addNote(el.noteInput.value);
      el.noteInput.value = '';
    } catch (e) { setStatus(e.message, true); }
  });

  document.getElementById('tripSeedTasksBtn')?.addEventListener('click', async () => {
    const btn = document.getElementById('tripSeedTasksBtn');
    if (btn) btn.disabled = true;
    try {
      await seedMissingTasks();
    } catch (e) {
      setStatus(e.message || '기본 목록 추가에 실패했습니다.', true);
    } finally {
      if (btn) btn.disabled = false;
    }
  });

  [el.packInput, el.taskInput, el.noteInput].forEach((input, idx) => {
    input?.addEventListener('keydown', e => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      [el.packAdd, el.taskAdd, el.noteAdd][idx]?.click();
    });
  });

  el.root?.addEventListener('change', async e => {
    const box = e.target.closest('input[type="checkbox"][data-id]');
    if (!box) return;
    try {
      await toggleItem(box.dataset.col, box.dataset.id, box.checked);
    } catch (err) {
      setStatus(err.message, true);
      box.checked = !box.checked;
    }
  });

  el.root?.addEventListener('click', async e => {
    const btn = e.target.closest('.trip-del');
    if (!btn) return;
    if (!confirm('이 항목을 삭제할까요?')) return;
    try {
      await deleteItem(btn.dataset.col, btn.dataset.id);
    } catch (err) {
      setStatus(err.message, true);
    }
  });

  el.tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const name = tab.dataset.tripTab;
      el.tabs.forEach(t => t.classList.toggle('active', t === tab));
      el.panes.forEach(p => {
        p.hidden = p.dataset.tripPane !== name;
      });
    });
  });

  let markReadLockUntil = 0;
  const onMarkRead = event => {
    event.preventDefault();
    event.stopPropagation();
    const now = Date.now();
    if (now < markReadLockUntil) return;
    markReadLockUntil = now + 500;
    markRead();
  };
  // pointerup is snappy on mobile and avoids double-firing with click
  markReadBtn?.addEventListener('pointerup', onMarkRead);
  markReadBtn?.addEventListener('click', onMarkRead);

  unreadBanner?.addEventListener('click', event => {
    if (event.target.closest('#tripMarkReadBtn')) return;
    const counts = countUnreadByType();
    if (counts.itin && !counts.pack && !counts.tasks && !counts.notes) {
      const itin = document.getElementById('itinerary');
      const feed = document.getElementById('itinChangeFeed');
      if (itin) itin.open = true;
      (feed || itin)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    const trip = document.getElementById('trip');
    if (trip) trip.open = true;
  });

  wireItinChangeFeedUi();

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') refreshUnread();
  });
}

async function boot() {
  if (!el.root) return;

  if (!isFirebaseConfigured()) {
    if (el.setup) el.setup.hidden = false;
    if (el.gate) el.gate.hidden = true;
    if (el.session) el.session.hidden = true;
    if (el.room) el.room.hidden = true;
    if (el.needJoin) el.needJoin.hidden = false;
    openTripSettings();
    refreshTripSettingsSummary();
    setStatus('Firebase 설정 후 여행방을 사용할 수 있습니다.', true);
    return;
  }

  if (el.setup) el.setup.hidden = true;
  showGate();
  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);
  bindUi();

  const params = new URLSearchParams(location.search);
  const roomFromUrl = normalizeCode(params.get('room'));
  if (roomFromUrl) {
    if (el.code) el.code.value = roomFromUrl;
    openTripSettings();
  }

  const session = loadSession();
  if (session?.nickname) el.nick.value = session.nickname;

  try {
    await ensureAuth();
  } catch (err) {
    console.error(err);
    setStatus('인증에 실패했습니다. Firebase Anonymous 설정을 확인해 주세요.', true);
    return;
  }

  onAuthStateChanged(auth, async user => {
    uid = user?.uid || null;
  });

  if (session?.nickname && session?.tripCode) {
    nickname = session.nickname;
    tripCode = session.tripCode;
    try {
      const snap = await getDoc(doc(db, 'trips', tripCode));
      if (!snap.exists()) {
        clearSession();
        showGate();
        openTripSettings();
        setStatus('이전 방을 찾지 못했어요. 다시 참여해 주세요.', true);
        return;
      }
      await setDoc(doc(db, 'trips', tripCode, 'members', uid), {
        nickname,
        joinedAt: serverTimestamp()
      }, { merge: true });
      await pruneDuplicateNicknames(nickname);
      await enterRoom();
      setStatus(`${tripCode} 방에 다시 입장했습니다.`);
    } catch (err) {
      console.error(err);
      showGate();
      openTripSettings();
      setStatus(err.message || '재입장 실패', true);
    }
  }
}

boot();
