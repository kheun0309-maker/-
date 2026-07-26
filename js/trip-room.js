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

const STORAGE_KEY = 'kk-trip-room-session';
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const MAX_NOTES = 40;
const TITLE_BASE = '코타키나발루 · 라사 리아 4일';
const ADMIN_NICKNAME = '은섹젤';

function readKey(code) {
  return `kk-trip-read-${code}`;
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
let dataCache = { pack: [], tasks: [], notes: [] };
const unreadBanner = document.getElementById('tripUnreadBanner');
const unreadText = document.getElementById('tripUnreadText');
const markReadBtn = document.getElementById('tripMarkReadBtn');

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

function loadLastRead(code) {
  lastReadAt = Number(localStorage.getItem(readKey(code)) || 0);
}

function isNoteUnread(data) {
  if (!data || data.author === nickname) return false;
  return toMs(data.createdAt) > lastReadAt;
}

function isItemUnread(data) {
  if (!data) return false;
  const when = toMs(data.updatedAt);
  if (when <= lastReadAt) return false;
  const actor = data.updatedBy || data.doneBy || data.createdBy;
  return Boolean(actor && actor !== nickname);
}

function countUnreadByType() {
  const counts = { pack: 0, tasks: 0, notes: 0, total: 0 };
  if (!tripCode || !nickname) return counts;

  dataCache.pack.forEach(docSnap => {
    if (isItemUnread(docSnap.data())) counts.pack += 1;
  });
  dataCache.tasks.forEach(docSnap => {
    if (isItemUnread(docSnap.data())) counts.tasks += 1;
  });
  dataCache.notes.forEach(docSnap => {
    if (isNoteUnread(docSnap.data())) counts.notes += 1;
  });
  counts.total = counts.pack + counts.tasks + counts.notes;
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
  document.querySelectorAll('[data-trip-badge], [data-tab-badge]').forEach(badge => setBadgeEl(badge, 0));
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
  setBadgeEl(document.querySelector('[data-tab-badge="pack"]'), counts.pack);
  setBadgeEl(document.querySelector('[data-tab-badge="tasks"]'), counts.tasks);
  setBadgeEl(document.querySelector('[data-tab-badge="notes"]'), counts.notes);

  if (unreadBanner && unreadText) {
    if (n > 0) {
      const parts = [];
      if (counts.pack) parts.push(`준비물 ${counts.pack}`);
      if (counts.tasks) parts.push(`출발 전 ${counts.tasks}`);
      if (counts.notes) parts.push(`공지 ${counts.notes}`);
      unreadText.textContent = `안 본 소식 ${label}개 (${parts.join(' · ')})`;
      unreadBanner.classList.add('is-on');
    } else {
      unreadText.textContent = '';
      unreadBanner.classList.remove('is-on');
    }
  }

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

function latestKnownUpdateMs() {
  let maxTs = Date.now();
  const bump = value => {
    const ms = toMs(value);
    if (ms > maxTs) maxTs = ms;
  };
  dataCache.pack.forEach(docSnap => {
    const data = docSnap.data() || {};
    bump(data.updatedAt);
  });
  dataCache.tasks.forEach(docSnap => {
    const data = docSnap.data() || {};
    bump(data.updatedAt);
  });
  dataCache.notes.forEach(docSnap => {
    const data = docSnap.data() || {};
    bump(data.createdAt);
  });
  return maxTs;
}

function markRead({ silent = false } = {}) {
  // Instant feedback first (button should feel immediate)
  clearUnreadUiNow();
  if (markReadBtn) {
    markReadBtn.textContent = '확인됨';
    markReadBtn.disabled = true;
  }

  // Use latest item time so server/client clock skew cannot keep items unread
  lastReadAt = latestKnownUpdateMs() + 1000;
  if (tripCode) localStorage.setItem(readKey(tripCode), String(lastReadAt));
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

function showGate() {
  el.gate.hidden = false;
  el.room.hidden = true;
}

function showRoom() {
  el.gate.hidden = true;
  el.room.hidden = false;
  el.codeLabel.textContent = tripCode;
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
  docs.forEach(d => {
    const data = d.data();
    const unread = isItemUnread(data);
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
    const unread = isNoteUnread(data);
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
  clearUnsubs();
  loadLastRead(tripCode);
  if (!lastReadAt) markRead({ silent: true });
  dataCache = { pack: [], tasks: [], notes: [] };

  unsubs.push(onSnapshot(collection(db, 'trips', tripCode, 'members'), snap => {
    renderMembers(snap.docs);
  }));

  unsubs.push(onSnapshot(
    query(collection(db, 'trips', tripCode, 'packItems'), orderBy('text')),
    snap => {
      dataCache.pack = snap.docs;
      renderChecklist(el.packList, snap.docs, 'packItems');
      refreshUnread();
    }
  ));

  unsubs.push(onSnapshot(
    query(collection(db, 'trips', tripCode, 'taskItems'), orderBy('text')),
    snap => {
      dataCache.tasks = snap.docs;
      renderChecklist(el.taskList, snap.docs, 'taskItems');
      refreshUnread();
    }
  ));

  unsubs.push(onSnapshot(
    query(collection(db, 'trips', tripCode, 'notes'), orderBy('createdAt', 'desc')),
    snap => {
      dataCache.notes = snap.docs;
      renderNotes(snap.docs);
      refreshUnread();
      // trim old notes beyond MAX_NOTES (best-effort by newest clients)
      if (snap.docs.length > MAX_NOTES) {
        snap.docs.slice(MAX_NOTES).forEach(extra => {
          deleteDoc(extra.ref).catch(() => {});
        });
      }
    }
  ));
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
  renderUnreadBadges();
  setStatus('방에서 나왔습니다.');
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
      await addItem('packItems', el.packInput.value);
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
    const trip = document.getElementById('trip');
    if (trip) trip.open = true;
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') refreshUnread();
  });
}

async function boot() {
  if (!el.root) return;

  if (!isFirebaseConfigured()) {
    el.setup.hidden = false;
    el.gate.hidden = true;
    el.room.hidden = true;
    setStatus('Firebase 설정 후 여행방을 사용할 수 있습니다.', true);
    return;
  }

  el.setup.hidden = true;
  showGate();
  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);
  bindUi();

  const params = new URLSearchParams(location.search);
  const roomFromUrl = normalizeCode(params.get('room'));
  if (roomFromUrl) el.code.value = roomFromUrl;

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
      setStatus(err.message || '재입장 실패', true);
    }
  }
}

boot();
