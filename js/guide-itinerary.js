/** 가이드 카드 → 일정 바로 추가 */

import { getItineraryApi } from './itinerary-editor.js';
import { getGuideContentApi } from './guide-content.js';

const SECTION_META = {
  food: { label: '맛집', day: 'day3', time: '19:00', task: '식사' },
  massage: { label: '마사지', day: 'day3', time: '20:30', task: '마사지' },
  hopping: { label: '호핑', day: 'day3', time: '08:30', task: '섬 호핑 · 스노클링' },
  resort: { label: '숙소·이동', day: 'day1', time: '', task: '숙소·이동' },
  alternatives: { label: '귀국·휴식', day: 'day4', time: '21:00', task: '귀국 전 휴식' }
};

let draft = null;

function createSheet() {
  if (document.getElementById('scheduleSheet')) return;
  document.body.insertAdjacentHTML('beforeend', `
    <div class="schedule-sheet" id="scheduleSheet" hidden role="dialog" aria-modal="true" aria-labelledby="scheduleTitle">
      <div class="schedule-sheet-card">
        <div class="schedule-sheet-head">
          <div>
            <small id="scheduleType">추천 장소</small>
            <h2 id="scheduleTitle">일정에 추가</h2>
          </div>
          <button type="button" class="schedule-sheet-close" data-schedule-close aria-label="닫기">×</button>
        </div>
        <form class="schedule-form" id="scheduleForm">
          <div class="schedule-form-row">
            <label>날짜
              <select id="scheduleDay">
                <option value="day1">Day 1 · 8/13</option>
                <option value="day2">Day 2 · 8/14</option>
                <option value="day3">Day 3 · 8/15</option>
                <option value="day4">Day 4 · 8/16</option>
              </select>
            </label>
            <label>시간
              <input id="scheduleTime" type="time" inputmode="numeric">
            </label>
          </div>
          <label>장소
            <input id="schedulePlace" type="text" maxlength="120" required>
          </label>
          <label>할 일
            <input id="scheduleTask" type="text" maxlength="160" required>
          </label>
          <label>메모
            <textarea id="scheduleNote" maxlength="800"></textarea>
          </label>
          <p class="schedule-status" id="scheduleStatus" role="status"></p>
          <div class="schedule-form-actions">
            <button type="button" class="schedule-cancel" data-schedule-close>취소</button>
            <button type="submit" class="schedule-save" id="scheduleSave">일정에 추가</button>
          </div>
        </form>
      </div>
    </div>
    <div class="schedule-toast" id="scheduleToast" hidden role="status"></div>
  `);
}

function getItem(section, itemId) {
  const content = getGuideContentApi().getSnapshot();
  const bucket = content[section]?.items || [];
  return bucket.find(item => item.id === itemId) || null;
}

function summarize(text, max = 520) {
  const clean = String(text || '').replace(/\n{3,}/g, '\n\n').trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

function itemDraft(section, item) {
  const meta = SECTION_META[section];
  if (!meta || !item) return null;

  let place = item.name || item.title || '';
  if (section === 'hopping') place = 'South Jetty · 코타키나발루 호핑투어';
  if (section === 'resort' && item.id === 'airport-pickup') place = 'KKIA → 샹그릴라 라사 리아';
  if (section === 'resort' && item.id === 'resort-shuttle') place = '라사 리아 리조트 셔틀';
  if (section === 'resort' && item.id === 'return-transfer') place = '라사 리아 → KKIA';

  return {
    section,
    itemId: item.id,
    typeLabel: meta.label,
    day: meta.day,
    time: meta.time,
    place,
    task: meta.task,
    note: summarize(item.desc || item.body || ''),
    imageUrl: item.imageUrl || '',
    placeMapsUrl: item.mapsUrl || ''
  };
}

function setStatus(message = '', error = false) {
  const status = document.getElementById('scheduleStatus');
  if (!status) return;
  status.textContent = message;
  status.classList.toggle('is-error', error);
}

function setSheetOpen(open) {
  const sheet = document.getElementById('scheduleSheet');
  if (!sheet) return;
  sheet.hidden = !open;
  document.body.style.overflow = open ? 'hidden' : '';
  if (!open) draft = null;
}

function openSheet(section, itemId) {
  const item = getItem(section, itemId);
  draft = itemDraft(section, item);
  if (!draft) return;

  document.getElementById('scheduleType').textContent = `${draft.typeLabel} 추천`;
  document.getElementById('scheduleTitle').textContent = draft.place;
  document.getElementById('scheduleDay').value = draft.day;
  document.getElementById('scheduleTime').value = draft.time;
  document.getElementById('schedulePlace').value = draft.place;
  document.getElementById('scheduleTask').value = draft.task;
  document.getElementById('scheduleNote').value = draft.note;

  const canEdit = getItineraryApi().canEdit();
  const save = document.getElementById('scheduleSave');
  save.textContent = canEdit ? '일정에 추가' : '여행방 설정 열기';
  setStatus(canEdit ? '날짜와 시간을 확인한 뒤 추가하세요.' : '일정 저장은 여행방 입장 후 사용할 수 있어요.', !canEdit);
  setSheetOpen(true);
  setTimeout(() => document.getElementById('scheduleDay')?.focus(), 100);
}

function showToast(message) {
  const toast = document.getElementById('scheduleToast');
  if (!toast) return;
  toast.textContent = message;
  toast.hidden = false;
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => { toast.hidden = true; }, 2600);
}

async function submit(event) {
  event.preventDefault();
  if (!draft) return;
  const api = getItineraryApi();
  if (!api.canEdit()) {
    setSheetOpen(false);
    window.dispatchEvent(new CustomEvent('guide:navigate', { detail: { id: 'settings' } }));
    return;
  }

  const day = document.getElementById('scheduleDay').value;
  const time = document.getElementById('scheduleTime').value;
  const place = document.getElementById('schedulePlace').value.trim();
  const task = document.getElementById('scheduleTask').value.trim();
  const note = document.getElementById('scheduleNote').value.trim();
  if (!place || !task) {
    setStatus('장소와 할 일을 입력해 주세요.', true);
    return;
  }

  const duplicate = api.getSnapshot().days
    .find(item => item.id === day)?.items
    .some(item => item.place.trim() === place && (!time || item.time === time));
  if (duplicate && !window.confirm('같은 날짜에 비슷한 일정이 있어요. 그래도 추가할까요?')) return;

  const save = document.getElementById('scheduleSave');
  save.disabled = true;
  save.textContent = '추가 중…';
  setStatus('여행방 일정에 저장하고 있어요.');
  try {
    await api.addItem({
      day,
      time,
      place,
      task,
      note,
      imageUrl: draft.imageUrl,
      placeMapsUrl: draft.placeMapsUrl,
      source: '가이드에서 추가'
    });
    setSheetOpen(false);
    showToast(`${place} · 일정에 추가했어요`);
    window.dispatchEvent(new CustomEvent('guide:navigate', { detail: { id: 'itinerary' } }));
  } catch (error) {
    setStatus(error?.message || '일정 추가에 실패했어요.', true);
  } finally {
    save.disabled = false;
    save.textContent = '일정에 추가';
  }
}

function init() {
  createSheet();

  document.addEventListener('click', event => {
    const add = event.target.closest('[data-schedule-section][data-schedule-id]');
    if (add) {
      event.preventDefault();
      openSheet(add.dataset.scheduleSection, add.dataset.scheduleId);
      return;
    }
    if (event.target.closest('[data-schedule-close]') || event.target.id === 'scheduleSheet') {
      setSheetOpen(false);
    }
  });

  document.getElementById('scheduleForm')?.addEventListener('submit', submit);
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !document.getElementById('scheduleSheet')?.hidden) {
      setSheetOpen(false);
    }
  });
}

init();
