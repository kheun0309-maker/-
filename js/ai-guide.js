/** 코타키나발루 가이드 AI — 가이드 컨텍스트·웹검색·일정 제안(확인 후 적용) */

import { getItineraryApi } from './itinerary-editor.js';
import { GUIDE_SUMMARY, getGuideContext, listGuideSections } from './guide-context.js';

const KEY_STORAGE = 'kk-openai-api-key';
const MODEL_STORAGE = 'kk-openai-model';
const DEFAULT_MODEL = 'gpt-5.6-luna';
const MAX_HISTORY = 20;
const MAX_TOOL_ROUNDS = 8;

const SYSTEM_PROMPT = `당신은 이 여행 앱의 AI 가이드입니다. 답변·일정 제안의 1순위 근거는 앱 가이드입니다.

역할:
1) 가이드 요약/섹션(get_guide_section)과 현재 일정(get_itinerary)을 활용해 답변
2) 앱에 없는 최신 정보만 web_search
3) 맛집·마사지·호핑·셔틀 등을 일정에 넣을 때는 propose_itinerary_change로 제안 (즉시 저장 금지)
4) day/시간/어느 가게인지 불명확하면 ask_clarification으로 질문

일정 반영 요령:
- 맛집 추가 예: day3, time 저녁, place 가게명, task 식사, note에 메뉴·팁, placeMapsUrl 가능하면 포함
- 마사지 추가 예: day3, time 19:30~, place Chillax/Warisan, task 마사지
- 수정/삭제는 get_itinerary로 itemId 확인 후 제안
- 사용자에게 "적용"을 누르라고 안내

규칙:
- 한국어, 간결하게. 앱 섹션 링크(#food #massage #hopping #resort-shuttle #itinerary 등) 활용
- 금액 MYR 우선. 위험·의료는 일반 안내만.`;

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
      name: 'web_search',
      description: '앱 가이드에 없는 최신·상세 정보만 인터넷 검색합니다.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: '검색어 (영어 또는 한국어)' }
        },
        required: ['query'],
        additionalProperties: false
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'ask_clarification',
      description: '일정 제안 전 확인이 필요할 때 사용. 이번 턴은 질문으로 끝냅니다.',
      parameters: {
        type: 'object',
        properties: {
          questions: {
            type: 'array',
            items: { type: 'string' },
            description: '1~3개의 짧은 확인 질문'
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
      description: '맛집/마사지/호핑 등 일정 추가·수정·삭제 제안. 사용자 적용 버튼 후에만 저장됩니다.',
      parameters: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['add', 'update', 'delete'] },
          day: { type: 'string', enum: ['day1', 'day2', 'day3', 'day4'] },
          itemId: { type: 'string', description: 'update/delete 시 필수' },
          time: { type: 'string' },
          place: { type: 'string' },
          task: { type: 'string' },
          note: { type: 'string' },
          placeMapsUrl: { type: 'string' },
          reason: { type: 'string', description: '제안 이유·가이드/검색 근거 한 줄' }
        },
        required: ['action', 'day', 'reason'],
        additionalProperties: false
      }
    }
  }
];

function $(id) {
  return document.getElementById(id);
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
  return esc(text).replace(/(#([a-z0-9-]+))/gi, '<a href="$1" data-open-hash="$2">$1</a>');
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
  const logEl = $('aiChatLog');
  const form = $('aiChatForm');
  const input = $('aiChatInput');
  const sendBtn = $('aiChatSend');
  const chipWrap = $('aiSuggestChips');

  let history = [];
  let busy = false;
  let proposalSeq = 0;
  const proposals = new Map();

  const refreshKeyUi = (msg = '') => {
    const saved = loadKey();
    if (keyInput) {
      keyInput.value = saved ? `••••••••••••${keyTail(saved)}` : '';
      keyInput.placeholder = saved ? '저장됨 · 바꾸려면 새 키 붙여넣기' : 'sk-... 붙여넣고 저장';
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
    const api = getItineraryApi();
    const card = document.createElement('div');
    card.className = 'ai-bubble ai-assistant ai-proposal';
    const actionLabel = ({ add: '추가', update: '수정', delete: '삭제' })[proposal.action] || proposal.action;
    const lines = [
      `<div class="ai-proposal-title">일정 ${esc(actionLabel)} 제안 · ${esc(dayLabel(proposal.day))}</div>`,
      proposal.reason ? `<div class="ai-proposal-reason">${esc(proposal.reason)}</div>` : '',
      `<div class="ai-proposal-body">`
    ];
    if (proposal.action === 'delete') {
      lines.push(`<div>삭제 대상 ID: ${esc(proposal.itemId || '')}</div>`);
    } else {
      if (proposal.time) lines.push(`<div>시간: ${esc(proposal.time)}</div>`);
      if (proposal.place) lines.push(`<div>장소: ${esc(proposal.place)}</div>`);
      if (proposal.task) lines.push(`<div>할 일: ${esc(proposal.task)}</div>`);
      if (proposal.note) lines.push(`<div>메모: ${esc(proposal.note)}</div>`);
    }
    if (proposal.action !== 'add' && proposal.itemId) {
      lines.push(`<div class="tiny">itemId: ${esc(proposal.itemId)}</div>`);
    }
    lines.push('</div>');
    if (!api.canEdit()) {
      lines.push('<div class="ai-proposal-warn">여행방에 입장해야 적용할 수 있어요.</div>');
    }
    lines.push(`
      <div class="ai-proposal-actions">
        <button type="button" class="ai-apply" data-pid="${proposal.id}">적용</button>
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
    if (name === 'web_search') {
      setStatus('웹 검색 중…');
      return webSearch(apiKey, args.query);
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
    return { ok: false, error: `알 수 없는 도구: ${name}` };
  };

  const chatWithTools = async (apiKey, model, messages) => {
    let clarificationText = '';
    for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
      setStatus(round ? `도구 실행 중… (${round + 1})` : '답변 작성 중…');
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model,
          temperature: 0.3,
          messages,
          tools: TOOLS,
          tool_choice: 'auto'
        })
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
    if (logEl) logEl.innerHTML = '';
    setStatus('API 키를 이 기기에서 삭제했어요.');
  });

  modelSelect?.addEventListener('change', () => saveModel(modelSelect.value));

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

    const api = getItineraryApi();
    if (!api.canEdit()) {
      setStatus('여행방에 입장한 뒤 적용할 수 있어요.', true);
      appendBubble('assistant', '여행방에 입장해야 일정을 저장할 수 있어요. 함께 준비에서 닉네임으로 입장해 주세요.');
      return;
    }

    applyBtn.disabled = true;
    rejectBtn?.setAttribute('disabled', 'disabled');
    setStatus('일정에 적용 중…');
    try {
      if (proposal.action === 'add') {
        await api.addItem(proposal);
      } else if (proposal.action === 'update') {
        await api.updateItem(proposal.itemId, proposal);
      } else if (proposal.action === 'delete') {
        await api.deleteItem(proposal.itemId);
      }
      proposal.status = 'applied';
      appendBubble('assistant', `일정에 반영했어요. 앱에서 보기: #itinerary`);
      history.push({
        role: 'assistant',
        content: `사용자가 일정 제안(${pid})을 적용했습니다. action=${proposal.action}, day=${proposal.day}.`
      });
      setStatus('일정에 반영했어요.');
      document.getElementById('itinerary')?.setAttribute('open', '');
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
        '도구: get_guide_section, get_itinerary, web_search, ask_clarification, propose_itinerary_change',
        '맛집/마사지 일정 반영 요청 시: get_guide_section → (필요시 질문) → propose_itinerary_change 순서 권장.'
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
