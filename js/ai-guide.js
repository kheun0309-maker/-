/** 코타키나발루 가이드 AI Q&A (OpenAI) — API 키는 이 기기에만 저장 */

const KEY_STORAGE = 'kk-openai-api-key';
const MODEL_STORAGE = 'kk-openai-model';
const DEFAULT_MODEL = 'gpt-4o-mini';
const MAX_HISTORY = 12;

const SYSTEM_PROMPT = `당신은 코타키나발루(Kota Kinabalu) 4일 여행 가이드 앱의 도우미입니다.
사용자 일정: 2026-08-13~17, 숙소 Shangri-La Rasa Ria (투아란, 시내·공항 약 45분).
항공: 가는 편 KE5761 ICN→BKI(야간 도착), 귀국 KE5762(잠정).
핵심: Day1 야간 도착·픽업, Day2 리조트·반딧불이, Day3 호핑·시내 마사지·맛집, Day4/귀국 휴식.
앱 섹션: 함께준비, 일정, 호핑, 맛집, 마사지, 셔틀, 공항픽업, 지도, 항공, 환율, 짐.
답변 규칙:
- 한국어로 짧고 실용적으로 (기본 3~8문장).
- 확실하지 않으면 추정임을 밝히고, 공식/프론트/현장 확인을 권유.
- 금액은 MYR 기준, 필요하면 대략 원화도 함께.
- 앱 내 관련 섹션이 있으면 마지막에 "앱에서 보기: #섹션id" 형태로 1개 추천 (예: #hopping, #massage, #resort-shuttle, #airport-pickup, #food, #itinerary).
- 위험·불법·의료 응급은 일반 안내만 하고 전문가/현지 도움을 권유.`;

function $(id) {
  return document.getElementById(id);
}

function loadKey() {
  try { return localStorage.getItem(KEY_STORAGE) || ''; } catch (_) { return ''; }
}

function saveKey(key) {
  try {
    if (key) localStorage.setItem(KEY_STORAGE, key);
    else localStorage.removeItem(KEY_STORAGE);
  } catch (_) {}
}

function loadModel() {
  try { return localStorage.getItem(MODEL_STORAGE) || DEFAULT_MODEL; } catch (_) { return DEFAULT_MODEL; }
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
  return esc(text).replace(/(#([a-z0-9-]+))/gi, '<a href="$1" data-open-hash="$2">$1</a>');
}

function fxHint() {
  try {
    const rate = typeof window.kkMyrToKrw === 'function' ? window.kkMyrToKrw() : null;
    if (Number.isFinite(rate)) return `현재 앱 환율 참고: 1 MYR ≈ ${Math.round(rate)}원.`;
  } catch (_) {}
  return '';
}

export function initAiGuide() {
  const root = $('aiGuide');
  if (!root) return;

  const keyInput = $('aiApiKey');
  const modelSelect = $('aiModel');
  const saveBtn = $('aiKeySave');
  const clearBtn = $('aiKeyClear');
  const statusEl = $('aiStatus');
  const logEl = $('aiChatLog');
  const form = $('aiChatForm');
  const input = $('aiChatInput');
  const sendBtn = $('aiChatSend');
  const chipWrap = $('aiSuggestChips');

  let history = [];
  let busy = false;

  if (keyInput) keyInput.value = loadKey() ? '••••••••••••' : '';
  if (modelSelect) modelSelect.value = loadModel();

  const setStatus = (msg, isError = false) => {
    if (!statusEl) return;
    statusEl.textContent = msg || '';
    statusEl.classList.toggle('is-error', Boolean(isError && msg));
  };

  const appendBubble = (role, text) => {
    if (!logEl) return;
    const div = document.createElement('div');
    div.className = `ai-bubble ai-${role}`;
    if (role === 'assistant') {
      div.innerHTML = linkify(text).replace(/\n/g, '<br>');
    } else {
      div.textContent = text;
    }
    logEl.appendChild(div);
    logEl.scrollTop = logEl.scrollHeight;
  };

  const setBusy = (on) => {
    busy = on;
    if (sendBtn) sendBtn.disabled = on;
    if (input) input.disabled = on;
  };

  saveBtn?.addEventListener('click', () => {
    const raw = (keyInput?.value || '').trim();
    if (!raw || raw.startsWith('••')) {
      setStatus('새 API 키를 입력한 뒤 저장해 주세요.', true);
      return;
    }
    if (!raw.startsWith('sk-')) {
      setStatus('OpenAI API 키는 보통 sk- 로 시작합니다.', true);
      return;
    }
    saveKey(raw);
    saveModel(modelSelect?.value || DEFAULT_MODEL);
    if (keyInput) keyInput.value = '••••••••••••';
    setStatus('이 기기에 API 키를 저장했어요. (서버/깃허브에는 올리지 않음)');
  });

  clearBtn?.addEventListener('click', () => {
    saveKey('');
    if (keyInput) keyInput.value = '';
    history = [];
    if (logEl) logEl.innerHTML = '';
    setStatus('API 키를 이 기기에서 삭제했어요.');
  });

  modelSelect?.addEventListener('change', () => {
    saveModel(modelSelect.value);
  });

  chipWrap?.addEventListener('click', e => {
    const btn = e.target.closest('[data-ai-q]');
    if (!btn || busy) return;
    if (input) input.value = btn.dataset.aiQ || '';
    form?.requestSubmit();
  });

  logEl?.addEventListener('click', e => {
    const a = e.target.closest('a[data-open-hash]');
    if (!a) return;
    e.preventDefault();
    const id = a.getAttribute('data-open-hash');
    const openId = ['airport-pickup', 'resort-shuttle'].includes(id) ? 'resort' : id;
    const section = document.getElementById(openId) || document.getElementById(id);
    if (section?.tagName === 'DETAILS') section.open = true;
    const target = document.getElementById(id) || section;
    target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    history.replaceState(null, '', `#${id}`);
  });

  form?.addEventListener('submit', async e => {
    e.preventDefault();
    if (busy) return;
    const question = (input?.value || '').trim();
    if (!question) return;

    const apiKey = loadKey();
    if (!apiKey) {
      setStatus('먼저 OpenAI API 키를 저장해 주세요.', true);
      keyInput?.focus();
      return;
    }

    appendBubble('user', question);
    if (input) input.value = '';
    history.push({ role: 'user', content: question });
    if (history.length > MAX_HISTORY) history = history.slice(-MAX_HISTORY);

    setBusy(true);
    setStatus('답변 작성 중…');
    const thinking = document.createElement('div');
    thinking.className = 'ai-bubble ai-assistant ai-thinking';
    thinking.textContent = '생각 중…';
    logEl?.appendChild(thinking);

    try {
      const model = loadModel();
      const sys = SYSTEM_PROMPT + (fxHint() ? `\n${fxHint()}` : '');
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model,
          temperature: 0.4,
          messages: [
            { role: 'system', content: sys },
            ...history
          ]
        })
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = data?.error?.message || `요청 실패 (${res.status})`;
        throw new Error(msg);
      }
      const answer = String(data?.choices?.[0]?.message?.content || '').trim();
      if (!answer) throw new Error('빈 답변을 받았어요.');

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
      // 실패한 user 턴은 히스토리에서 제거해 재시도 용이하게
      if (history.length && history[history.length - 1].role === 'user') history.pop();
    } finally {
      setBusy(false);
      input?.focus();
    }
  });
}
