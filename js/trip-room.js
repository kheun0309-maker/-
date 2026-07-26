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

function setStatus(msg, isError = false) {
  if (!el.status) return;
  el.status.textContent = msg || '';
  el.status.classList.toggle('is-error', Boolean(isError && msg));
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
  const batch = writeBatch(db);
  const colRef = collection(db, 'trips', tripCode, colName);
  texts.forEach(text => {
    const ref = doc(colRef);
    batch.set(ref, {
      text,
      done: false,
      doneBy: null,
      createdBy: creator,
      updatedAt: serverTimestamp()
    });
  });
  await batch.commit();
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

function renderMembers(docs) {
  el.members.innerHTML = '';
  docs.forEach(d => {
    const data = d.data();
    const chip = document.createElement('span');
    chip.className = 'trip-member';
    chip.textContent = data.nickname || '익명';
    if (d.id === uid) chip.classList.add('is-me');
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
    const li = document.createElement('li');
    li.className = 'trip-item' + (data.done ? ' is-done' : '');
    li.innerHTML = `
      <label>
        <input type="checkbox" ${data.done ? 'checked' : ''} data-id="${d.id}" data-col="${colName}">
        <span class="trip-item-text"></span>
      </label>
      <div class="trip-item-meta">
        <span class="trip-who"></span>
        <button type="button" class="trip-del" data-id="${d.id}" data-col="${colName}" aria-label="삭제">삭제</button>
      </div>
    `;
    li.querySelector('.trip-item-text').textContent = data.text || '';
    const who = li.querySelector('.trip-who');
    if (data.done && data.doneBy) who.textContent = `✓ ${data.doneBy}`;
    else if (data.createdBy) who.textContent = data.createdBy;
    target.appendChild(li);
  });
}

function renderNotes(docs) {
  el.noteList.innerHTML = '';
  if (!docs.length) {
    el.noteList.innerHTML = '<li class="trip-empty">아직 메모가 없습니다. 공지를 남겨 보세요.</li>';
    return;
  }
  docs.forEach(d => {
    const data = d.data();
    const li = document.createElement('li');
    li.className = 'trip-note';
    const when = data.createdAt?.toDate ? data.createdAt.toDate() : null;
    const time = when
      ? when.toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
      : '방금';
    li.innerHTML = `
      <div class="trip-note-head">
        <strong></strong>
        <span></span>
        <button type="button" class="trip-del" data-id="${d.id}" data-col="notes" aria-label="삭제">삭제</button>
      </div>
      <p></p>
    `;
    li.querySelector('strong').textContent = data.author || '익명';
    li.querySelector('span').textContent = time;
    li.querySelector('p').textContent = data.text || '';
    el.noteList.appendChild(li);
  });
}

async function enterRoom() {
  showRoom();
  clearUnsubs();

  unsubs.push(onSnapshot(collection(db, 'trips', tripCode, 'members'), snap => {
    renderMembers(snap.docs);
  }));

  unsubs.push(onSnapshot(
    query(collection(db, 'trips', tripCode, 'packItems'), orderBy('text')),
    snap => renderChecklist(el.packList, snap.docs, 'packItems')
  ));

  unsubs.push(onSnapshot(
    query(collection(db, 'trips', tripCode, 'taskItems'), orderBy('text')),
    snap => renderChecklist(el.taskList, snap.docs, 'taskItems')
  ));

  unsubs.push(onSnapshot(
    query(collection(db, 'trips', tripCode, 'notes'), orderBy('createdAt', 'desc')),
    snap => {
      renderNotes(snap.docs);
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
  clearSession();
  showGate();
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
  const url = `${location.origin}${location.pathname}?room=${tripCode}`;
  const payload = {
    title: '코타키나발루 여행방',
    text: `여행방 코드: ${tripCode}\n닉네임 정하고 함께 준비해요.`,
    url
  };
  if (navigator.share) {
    try {
      await navigator.share(payload);
      return;
    } catch (_) {}
  }
  try {
    await navigator.clipboard.writeText(`${payload.text}\n${url}`);
    setStatus('공유 문구를 복사했어요.');
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
