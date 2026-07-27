/** 상단 탭형 앱 셸 — 기존 섹션 id/hash와 호환 */

const GROUPS = {
  ai: {
    defaultPanel: 'ai',
    panels: [
      ['ai', '✨ 코파일럿']
    ]
  },
  plan: {
    defaultPanel: 'itinerary',
    panels: [
      ['itinerary', '📅 일정'],
      ['flights', '✈️ 항공'],
      ['late-rest', '🌙 귀국·휴식']
    ]
  },
  explore: {
    defaultPanel: 'food',
    panels: [
      ['food', '🍽 맛집'],
      ['massage', '💆 마사지'],
      ['hopping', '🏝 호핑'],
      ['resort', '🏨 숙소·이동'],
      ['map', '🗺 지도']
    ]
  },
  prepare: {
    defaultPanel: 'trip',
    panels: [
      ['trip', '👥 함께 준비'],
      ['pack', '🎒 개인 짐'],
      ['booking', '✅ 출발 전'],
      ['tips', '⚠ 주의사항']
    ]
  },
  tools: {
    defaultPanel: 'live',
    panels: [
      ['live', '⏱ 시각·환율'],
      ['settings', '⚙️ 설정']
    ]
  }
};

const state = {
  group: 'ai',
  panel: 'ai'
};

function panelGroup(panelId) {
  if (String(panelId).startsWith('custom-')) return 'explore';
  return Object.entries(GROUPS).find(([, group]) =>
    group.panels.some(([id]) => id === panelId)
  )?.[0] || 'ai';
}

function resolveTarget(rawId) {
  const id = String(rawId || '').replace(/^#/, '');
  if (!id) return { panel: GROUPS[state.group].defaultPanel, anchor: '' };
  const direct = document.getElementById(id);
  if (direct?.matches('details.fold-widget')) return { panel: id, anchor: '' };
  const parent = direct?.closest('details.fold-widget');
  if (parent?.id) return { panel: parent.id, anchor: id };
  return { panel: GROUPS.ai.defaultPanel, anchor: '' };
}

function allPanels() {
  return Array.from(document.querySelectorAll('details.fold-widget'));
}

function panelLabel(panel) {
  const known = Object.values(GROUPS)
    .flatMap(group => group.panels)
    .find(([id]) => id === panel.id)?.[1];
  if (known) return known;
  return panel.querySelector(':scope > summary')?.textContent?.trim() || panel.id;
}

function panelsForGroup(groupId) {
  const base = GROUPS[groupId]?.panels
    .map(([id, label]) => ({ id, label, el: document.getElementById(id) }))
    .filter(item => item.el) || [];
  if (groupId !== 'explore') return base;
  const custom = allPanels()
    .filter(panel => panel.id.startsWith('custom-'))
    .map(panel => ({ id: panel.id, label: `⭐ ${panelLabel(panel)}`, el: panel }));
  return [...base, ...custom];
}

function setPrimaryState(groupId) {
  document.querySelectorAll('.travel-tab[data-tab-group]').forEach(tab => {
    const active = tab.dataset.tabGroup === groupId;
    tab.setAttribute('aria-selected', String(active));
    tab.tabIndex = active ? 0 : -1;
  });
}

function renderSubtabs(groupId, activePanel) {
  const host = document.getElementById('travelSubtabs');
  if (!host) return;
  const panels = panelsForGroup(groupId);
  host.innerHTML = panels.map(({ id, label }) => `
    <button type="button" class="travel-subtab" role="tab"
      data-panel="${id}" aria-selected="${id === activePanel}" tabindex="${id === activePanel ? '0' : '-1'}">
      ${label}
    </button>
  `).join('');
  host.hidden = panels.length < 2;
  requestAnimationFrame(() => {
    host.querySelector('[aria-selected="true"]')?.scrollIntoView({
      behavior: 'smooth',
      block: 'nearest',
      inline: 'center'
    });
  });
}

function updateBottomNav(panelId) {
  document.querySelectorAll('.nav a').forEach(link => {
    const href = (link.getAttribute('href') || '').replace(/^#/, '');
    const open = link.dataset.open || href;
    link.classList.toggle('is-active', open === panelId);
  });
}

function activate(rawId, options = {}) {
  const { updateHash = true, scroll = true, anchorId = '' } = options;
  const resolved = resolveTarget(anchorId || rawId);
  let panelId = resolved.panel;
  let anchor = anchorId || resolved.anchor;
  let target = document.getElementById(panelId);

  if (!target?.matches('details.fold-widget')) {
    panelId = 'ai';
    target = document.getElementById(panelId);
    anchor = '';
  }
  if (!target) return;

  const groupId = panelGroup(panelId);
  state.group = groupId;
  state.panel = panelId;

  document.body.classList.add('tab-mode');
  allPanels().forEach(panel => {
    const active = panel === target;
    panel.classList.toggle('is-tab-active', active);
    panel.open = active;
    panel.setAttribute('role', 'tabpanel');
    panel.setAttribute('aria-hidden', String(!active));
  });

  setPrimaryState(groupId);
  renderSubtabs(groupId, panelId);
  updateBottomNav(panelId);

  if (panelId === 'map') {
    window.dispatchEvent(new CustomEvent('travel:map-visible'));
  }

  const hashId = anchor || panelId;
  if (updateHash && hashId) history.replaceState(null, '', `#${hashId}`);

  if (scroll) {
    const scrollTarget = (anchor && document.getElementById(anchor)) || target;
    requestAnimationFrame(() => {
      scrollTarget.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }
}

function activateGroup(groupId) {
  const group = GROUPS[groupId];
  if (!group) return;
  const currentInGroup = panelGroup(state.panel) === groupId ? state.panel : '';
  activate(currentInGroup || group.defaultPanel);
}

function keyboardTabs(event, selector, attr) {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
  const tabs = Array.from(document.querySelectorAll(selector));
  if (!tabs.length) return;
  const current = tabs.indexOf(event.target);
  if (current < 0) return;
  event.preventDefault();
  let next = current;
  if (event.key === 'ArrowRight') next = (current + 1) % tabs.length;
  if (event.key === 'ArrowLeft') next = (current - 1 + tabs.length) % tabs.length;
  if (event.key === 'Home') next = 0;
  if (event.key === 'End') next = tabs.length - 1;
  tabs[next].focus();
  if (attr === 'group') activateGroup(tabs[next].dataset.tabGroup);
  else activate(tabs[next].dataset.panel);
}

function bindNavigation() {
  document.addEventListener('click', event => {
    const primary = event.target.closest('.travel-tab[data-tab-group]');
    if (primary) {
      event.preventDefault();
      activateGroup(primary.dataset.tabGroup);
      return;
    }

    const subtab = event.target.closest('.travel-subtab[data-panel]');
    if (subtab) {
      event.preventDefault();
      activate(subtab.dataset.panel);
      return;
    }

    const link = event.target.closest('a[href^="#"]');
    if (!link) return;
    const href = (link.getAttribute('href') || '').replace(/^#/, '');
    const open = link.dataset.open || href;
    if (!document.getElementById(href) && !document.getElementById(open)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    activate(open, { anchorId: href !== open ? href : '' });
  }, true);

  document.getElementById('travelTabs')?.addEventListener('keydown', event => {
    keyboardTabs(event, '.travel-tab[data-tab-group]', 'group');
  });
  document.getElementById('travelSubtabs')?.addEventListener('keydown', event => {
    keyboardTabs(event, '.travel-subtab[data-panel]', 'panel');
  });

  window.addEventListener('hashchange', () => {
    activate(location.hash, { updateHash: false });
  });
  window.addEventListener('guide:navigate', event => {
    activate(event.detail?.id || 'itinerary');
  });
}

function observeCustomSections() {
  const host = document.getElementById('customSectionsHost');
  if (!host) return;
  new MutationObserver(() => {
    if (state.group === 'explore') {
      renderSubtabs('explore', state.panel);
      allPanels().forEach(panel => {
        if (panel.id !== state.panel) {
          panel.classList.remove('is-tab-active');
          panel.open = false;
          panel.setAttribute('aria-hidden', 'true');
        }
      });
    }
  }).observe(host, { childList: true, subtree: true });
}

function init() {
  bindNavigation();
  observeCustomSections();
  const initial = (location.hash || '#ai').replace(/^#/, '');
  activate(initial, { updateHash: false, scroll: false });
  window.travelTabs = { open: activate, openGroup: activateGroup, state };
}

init();
