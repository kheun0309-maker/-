/** 여행방 커스텀 가이드 섹션 — AI로 섹션·항목 추가 (URL 이미지, Storage 없음) */

import {
  collection,
  doc,
  setDoc,
  deleteDoc,
  onSnapshot,
  serverTimestamp
} from 'https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js';
import { logTripActivity } from './itinerary-editor.js';
import { normalizeImageUrl, formatRichText } from './guide-content.js';

const MAX_SECTIONS = 12;
const MAX_ITEMS = 20;

let ctx = null;
let unsub = null;
/** @type {Array<{id:string,title:string,intro:string,order:number,items:Array}>} */
let sections = [];

function esc(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function canEdit() {
  return Boolean(ctx?.db && ctx?.tripCode && ctx?.nickname);
}

function hostEl() {
  return document.getElementById('customSectionsHost');
}

function slugId(raw, fallback = '') {
  const fromRaw = String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  if (fromRaw) return fromRaw;
  const fb = String(fallback || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return fb || `sec-${Date.now().toString(36)}`;
}

function normalizeItem(it, i = 0) {
  const id = slugId(it?.id, `item${i + 1}`) || `item${i + 1}`;
  return {
    id,
    tag: String(it?.tag || '').slice(0, 40),
    title: String(it?.title || it?.name || '').slice(0, 100),
    body: String(it?.body || it?.desc || '').slice(0, 1200),
    imageUrl: normalizeImageUrl(it?.imageUrl),
    mapsUrl: String(it?.mapsUrl || '').trim().slice(0, 500),
    linkUrl: String(it?.linkUrl || '').trim().slice(0, 500),
    linkLabel: String(it?.linkLabel || '').slice(0, 40)
  };
}

function normalizeSection(data, id) {
  const items = Array.isArray(data?.items) ? data.items.map(normalizeItem).filter(it => it.title || it.body) : [];
  return {
    id: String(id || data?.id || '').slice(0, 40),
    title: String(data?.title || '새 섹션').slice(0, 60),
    intro: String(data?.intro || '').slice(0, 300),
    order: Number.isFinite(Number(data?.order)) ? Number(data.order) : 0,
    items: items.slice(0, MAX_ITEMS)
  };
}

function colRef() {
  return collection(ctx.db, 'trips', ctx.tripCode, 'customSections');
}

function secRef(sectionId) {
  return doc(ctx.db, 'trips', ctx.tripCode, 'customSections', sectionId);
}

function renderSections() {
  const host = hostEl();
  if (!host) return;

  if (!sections.length) {
    host.innerHTML = '';
    host.hidden = true;
    return;
  }

  host.hidden = false;
  const sorted = [...sections].sort((a, b) => (a.order - b.order) || a.title.localeCompare(b.title, 'ko'));
  host.innerHTML = sorted.map(sec => {
    const cards = (sec.items || []).map(it => {
      const links = [];
      if (it.mapsUrl) links.push(`<a href="${esc(it.mapsUrl)}" target="_blank" rel="noopener">구글지도</a>`);
      if (it.linkUrl) {
        links.push(`<a class="soft" href="${esc(it.linkUrl)}" target="_blank" rel="noopener">${esc(it.linkLabel || '링크')}</a>`);
      }
      const photo = it.imageUrl
        ? `<img class="card-photo" src="${esc(it.imageUrl)}" alt="${esc(it.title)}" loading="lazy" referrerpolicy="no-referrer">`
        : '';
      return `
        <div class="info-card" data-custom-item="${esc(it.id)}">
          ${photo}
          ${it.tag ? `<span class="tag ok">${esc(it.tag)}</span>` : ''}
          <b>${esc(it.title)}</b>
          ${it.body ? `<p>${formatRichText(it.body)}</p>` : ''}
          ${links.length ? `<div class="food-actions">${links.join('')}</div>` : ''}
          ${canEdit() ? `<div class="tiny" style="margin-top:6px;opacity:.65">item: ${esc(it.id)}</div>` : ''}
        </div>`;
    }).join('');

    return `
      <details class="widget fold-widget custom-section" id="custom-${esc(sec.id)}" open>
        <summary>${esc(sec.title)}</summary>
        <div class="fold-body">
          ${sec.intro ? `<p class="tiny" style="margin:-4px 0 10px">${formatRichText(sec.intro)}</p>` : ''}
          ${cards || '<p class="tiny">아직 항목이 없어요. AI로 정보를 추가해 보세요.</p>'}
          <p class="tiny" style="margin-top:8px">여행방 공유 섹션${canEdit() ? ` · id: ${esc(sec.id)}` : ''}</p>
        </div>
      </details>`;
  }).join('');
}

async function writeSection(sec, eventMeta) {
  if (!canEdit()) throw new Error('여행방에 입장해야 섹션을 수정할 수 있어요.');
  if (!sec.id) throw new Error('sectionId가 필요해요.');
  const payload = {
    title: sec.title,
    intro: sec.intro || '',
    order: Math.max(0, Math.floor(Number(sec.order) || 0)),
    items: sec.items || [],
    updatedBy: ctx.nickname,
    updatedAt: serverTimestamp()
  };
  await setDoc(secRef(sec.id), payload);
  if (eventMeta) {
    await logTripActivity({
      kind: 'custom',
      day: 'guide',
      summary: eventMeta.summary,
      detail: eventMeta.detail || '',
      itemId: eventMeta.itemId || sec.id
    });
  }
}

export function initCustomSectionsUi() {
  sections = [];
  renderSections();
}

export async function attachCustomSectionsRoom(nextCtx) {
  detachCustomSectionsRoom({ keepRender: true });
  ctx = nextCtx;
  if (!canEdit()) return;

  unsub = onSnapshot(
    colRef(),
    snap => {
      sections = snap.docs.map(d => normalizeSection(d.data(), d.id));
      renderSections();
    },
    err => console.warn('customSections listen failed', err)
  );
}

export function detachCustomSectionsRoom({ keepRender = false } = {}) {
  if (typeof unsub === 'function') {
    try { unsub(); } catch (_) {}
  }
  unsub = null;
  ctx = null;
  if (!keepRender) {
    sections = [];
    renderSections();
  }
}

export function getCustomSectionsApi() {
  return {
    canEdit: () => canEdit(),
    nickname: () => ctx?.nickname || '',
    tripCode: () => ctx?.tripCode || '',
    getSnapshot() {
      return {
        editable: canEdit(),
        sections: sections.map(s => ({
          id: s.id,
          title: s.title,
          intro: s.intro,
          order: s.order,
          items: s.items
        })),
        hint: '새 섹션: propose_custom_section(target=section, add). 항목: target=item, sectionId 필요.'
      };
    },
    async applyProposal(proposal) {
      if (!canEdit()) throw new Error('여행방에 입장해야 적용할 수 있어요.');
      const target = proposal.target || 'section';
      const action = proposal.action;
      const act = ({ add: '추가', update: '수정', delete: '삭제' })[action] || action;
      const reason = String(proposal.reason || '').slice(0, 120);

      if (target === 'section') {
        if (action === 'add') {
          if (sections.length >= MAX_SECTIONS) throw new Error(`섹션은 최대 ${MAX_SECTIONS}개까지예요.`);
          const id = slugId(proposal.sectionId, proposal.title);
          if (sections.some(s => s.id === id)) throw new Error('이미 있는 sectionId예요.');
          const title = String(proposal.title || '').trim();
          if (!title) throw new Error('섹션 제목(title)이 필요해요.');
          const sec = normalizeSection({
            title,
            intro: proposal.intro || '',
            order: sections.length,
            items: []
          }, id);
          await writeSection(sec, {
            summary: `섹션 ${act}: ${sec.title}`,
            detail: reason || `AI · 섹션 ${act}`,
            itemId: id
          });
          return { id, title: sec.title };
        }

        const sectionId = String(proposal.sectionId || '').trim();
        const prev = sections.find(s => s.id === sectionId);
        if (!prev) throw new Error('sectionId를 찾지 못했어요. get_editable_content(custom)로 확인하세요.');

        if (action === 'delete') {
          await deleteDoc(secRef(sectionId));
          await logTripActivity({
            kind: 'custom',
            day: 'guide',
            summary: `섹션 삭제: ${prev.title}`,
            detail: reason || 'AI · 섹션 삭제',
            itemId: sectionId
          });
          return { id: sectionId, deleted: true };
        }

        if (action === 'update') {
          const next = normalizeSection({
            ...prev,
            title: proposal.title != null ? proposal.title : prev.title,
            intro: proposal.intro != null ? proposal.intro : prev.intro,
            order: proposal.order != null ? Number(proposal.order) : prev.order,
            items: prev.items
          }, prev.id);
          await writeSection(next, {
            summary: `섹션 ${act}: ${next.title}`,
            detail: reason || `AI · 섹션 ${act}`,
            itemId: next.id
          });
          return next;
        }
        throw new Error('지원하지 않는 action이에요.');
      }

      if (target === 'item') {
        const sectionId = String(proposal.sectionId || '').trim();
        const prev = sections.find(s => s.id === sectionId);
        if (!prev) throw new Error('sectionId를 찾지 못했어요. 먼저 섹션을 추가하세요.');
        const items = [...(prev.items || [])];

        if (action === 'add') {
          if (items.length >= MAX_ITEMS) throw new Error(`항목은 섹션당 최대 ${MAX_ITEMS}개예요.`);
          const title = String(proposal.itemTitle || proposal.title || proposal.name || '').trim();
          if (!title) throw new Error('항목 제목(itemTitle)이 필요해요.');
          const item = normalizeItem({
            id: proposal.itemId || slugId(title, `item-${Date.now().toString(36)}`),
            tag: proposal.tag,
            title,
            body: proposal.body || proposal.desc || '',
            imageUrl: proposal.imageUrl,
            mapsUrl: proposal.mapsUrl,
            linkUrl: proposal.linkUrl,
            linkLabel: proposal.linkLabel
          }, items.length);
          if (items.some(it => it.id === item.id)) throw new Error('이미 있는 itemId예요.');
          items.push(item);
          const next = { ...prev, items };
          await writeSection(next, {
            summary: `${prev.title} · 항목 ${act}: ${item.title}`,
            detail: reason || `AI · 항목 ${act}`,
            itemId: item.id
          });
          return { sectionId, item };
        }

        const itemId = String(proposal.itemId || '').trim();
        const idx = items.findIndex(it => it.id === itemId);
        if (idx < 0) throw new Error('itemId를 찾지 못했어요.');

        if (action === 'delete') {
          const removed = items[idx];
          items.splice(idx, 1);
          await writeSection({ ...prev, items }, {
            summary: `${prev.title} · 항목 삭제: ${removed.title}`,
            detail: reason || 'AI · 항목 삭제',
            itemId
          });
          return { sectionId, deleted: itemId };
        }

        if (action === 'update') {
          const cur = items[idx];
          items[idx] = normalizeItem({
            ...cur,
            tag: proposal.tag != null ? proposal.tag : cur.tag,
            title: proposal.itemTitle != null || proposal.title != null || proposal.name != null
              ? (proposal.itemTitle || proposal.title || proposal.name)
              : cur.title,
            body: proposal.body != null || proposal.desc != null
              ? (proposal.body || proposal.desc)
              : cur.body,
            imageUrl: proposal.imageUrl != null ? proposal.imageUrl : cur.imageUrl,
            mapsUrl: proposal.mapsUrl != null ? proposal.mapsUrl : cur.mapsUrl,
            linkUrl: proposal.linkUrl != null ? proposal.linkUrl : cur.linkUrl,
            linkLabel: proposal.linkLabel != null ? proposal.linkLabel : cur.linkLabel
          }, idx);
          await writeSection({ ...prev, items }, {
            summary: `${prev.title} · 항목 ${act}: ${items[idx].title}`,
            detail: reason || `AI · 항목 ${act}`,
            itemId
          });
          return { sectionId, item: items[idx] };
        }
        throw new Error('지원하지 않는 action이에요.');
      }

      throw new Error('target은 section 또는 item 이어야 해요.');
    }
  };
}
