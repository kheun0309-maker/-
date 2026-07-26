/** 코타키나발루 가이드 AI — 질의·웹검색·일정 제안(확인 후 적용) */

import { getItineraryApi } from './itinerary-editor.js';

const KEY_STORAGE = 'kk-openai-api-key';
const MODEL_STORAGE = 'kk-openai-model';
const DEFAULT_MODEL = 'gpt-4o-mini';
const MAX_HISTORY = 20;
const MAX_TOOL_ROUNDS = 6;

const SYSTEM_PROMPT = `당신은 코타키나발루 4일 여행 가이드 앱의 도우미입니다.
일정: 2026-08-13~17, 숙소 Shangri-La Rasa Ria(시내·공항 약 45분).
항공: KE5761 ICN→BKI 야간 도착, 귀국 KE5762(잠정).
Day1 도착·픽업 / Day2 리조트·반딧불이 / Day3 호핑·맛집·마사지 / Day4 귀국 동선.

역할:
1) 일반 질문 답변
2) 필요하면 web_search로 최신/장소/요금 정보 확인
3) 일정 추가·수정·삭제는 절대 바로 적용하지 말고 propose_itinerary_change로 제안
4) 정보가 부족하거나 불확실하면 ask_clarification으로 짧게 질문 (추측으로 일정 쓰지 말 것)

규칙:
- 한국어, 간결하게.
- 일정 변경 전 day(day1~day4), 시간, 장소/할 일 중 핵심이 없으면 질문.
- 수정/삭제는 get_itinerary로 id를 확인한 뒤 itemId를 넣어 제안.
- 금액은 MYR 우선, 불확실하면 범위·출처 불확실을 명시.
- 앱 섹션 링크는 #hopping #massage #resort-shuttle #airport-pickup #food #itinerary 등.
- 위험·의료·불법은 일반 안내만.`;

const TOOLS = [
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
      description: '인터넷에서 장소·영업시간·요금·교통 등 사실을 검색합니다.',
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
      description: '일정을 제안하기 전에 사용자에게 확인이 필요할 때 사용합니다. 이 도구를 쓰면 이번 턴은 질문으로 끝납니다.',
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
      description: '일정 추가/수정/삭제 제안을 만듭니다. 사용자 확인 버튼이 뜬 뒤에만 실제로 저장됩니다.',
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
          reason: { type: 'string', description: '제안 이유·근거 한 줄' }
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
        model: 'gpt-4o-mini',
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

  if (keyInput) keyInput.value = loadKey() ? '••••••••••••' : '';
  if (modelSelect) modelSelect.value = loadModel();

  const setStatus = (msg, isError = false) => {
    if (!statusEl) return;
    statusEl.textContent = msg || '';
    statusEl.classList.toggle('is-error', Boolean(isError && msg));
  };

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
    const thinking = document.createElement('div');
    thinking.className = 'ai-bubble ai-assistant ai-thinking';
    thinking.textContent = '생각 중… (검색·일정 확인 가능)';
    logEl?.appendChild(thinking);

    try {
      const api = getItineraryApi();
      const model = loadModel();
      const sys = [
        SYSTEM_PROMPT,
        fxHint(),
        api.canEdit()
          ? `현재 여행방 ${api.tripCode()}에 ${api.nickname()}(으)로 입장되어 일정 편집 가능.`
          : '아직 여행방 미입장. 일정 제안은 가능하지만 적용하려면 입장이 필요함을 안내.',
        '도구: get_itinerary, web_search, ask_clarification, propose_itinerary_change'
      ].filter(Boolean).join('\n');

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
