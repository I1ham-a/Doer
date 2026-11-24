'use strict';
const $ = s => document.querySelector(s);
const KEY = 'doer.v1';
const COLORS = ['#4772fa', '#e5484d', '#f5a524', '#30a46c', '#8e4ec6', '#0091b2', '#e93d82'];
const uid = () => Math.random().toString(36).slice(2, 10);
const pad = n => String(n).padStart(2, '0');
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parse = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const today = () => ymd(new Date());
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const MONTHS = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
const WD = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];

let state = load();
let view = 'today';          // today | tomorrow | week | all | calendar | done | list:<id>
let selId = null;            // selected task
let calMonth = new Date(); calMonth.setDate(1);
let calDay = today();
let query = '';

function load() {
  try { const s = JSON.parse(localStorage.getItem(KEY)); if (s && s.tasks) return s; } catch (e) {}
  return { lists: [{ id: 'inbox', name: 'Входящие', color: COLORS[0] }, { id: uid(), name: 'Работа', color: COLORS[2] }, { id: uid(), name: 'Личное', color: COLORS[3] }], tasks: [] };
}
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {} };
const task = id => state.tasks.find(t => t.id === id);
const list = id => state.lists.find(l => l.id === id) || state.lists[0];

function dateLabel(ds) {
  const t = today();
  if (ds === t) return 'Сегодня';
  if (ds === ymd(addDays(new Date(), 1))) return 'Завтра';
  if (ds === ymd(addDays(new Date(), -1))) return 'Вчера';
  const d = parse(ds);
  return `${WD[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()].toLowerCase().replace(/[ьй]$/, 'я').replace('март', 'марта').replace('август', 'августа')}`;
}

// ---------- filtering ----------
function visible() {
  const t = today(), tm = ymd(addDays(new Date(), 1)), w = ymd(addDays(new Date(), 6));
  let r = state.tasks;
  if (query) { const q = query.toLowerCase(); return r.filter(x => (x.title + ' ' + x.notes).toLowerCase().includes(q)); }
  if (view === 'done') return r.filter(x => x.done).sort((a, b) => (b.doneAt || 0) - (a.doneAt || 0));
  r = r.filter(x => !x.done);
  if (view === 'today') return r.filter(x => x.date && x.date <= t);
  if (view === 'tomorrow') return r.filter(x => x.date === tm);
  if (view === 'week') return r.filter(x => x.date && x.date <= w);
  if (view === 'calendar') return r.filter(x => x.date === calDay);
  if (view.startsWith('list:')) return r.filter(x => x.listId === view.slice(5));
  return r;
}
const prioKey = p => p ? p : 9;
function cmp(a, b) { return (a.date || '9').localeCompare(b.date || '9') || (a.time || '99').localeCompare(b.time || '99') || prioKey(a.prio) - prioKey(b.prio) || a.created - b.created; }

// ---------- rendering ----------
function renderSide() {
  const t = today(), tm = ymd(addDays(new Date(), 1)), w = ymd(addDays(new Date(), 6));
  const open = state.tasks.filter(x => !x.done);
  const smart = [
    ['today', '📅', 'Сегодня', open.filter(x => x.date && x.date <= t).length],
    ['tomorrow', '🌅', 'Завтра', open.filter(x => x.date === tm).length],
    ['week', '🗓', 'Ближайшие 7 дней', open.filter(x => x.date && x.date <= w).length],
    ['all', '📥', 'Все задачи', open.length],
    ['calendar', '📆', 'Календарь', ''],
    ['done', '✅', 'Выполнено', '']
  ];
  $('#smart').innerHTML = smart.map(([id, ic, n, c]) => `<button class="nav ${view === id ? 'active' : ''}" data-view="${id}"><span>${ic}</span>${n}<span class="cnt">${c}</span></button>`).join('');
  $('#lists').innerHTML = state.lists.map(l => `<button class="nav ${view === 'list:' + l.id ? 'active' : ''}" data-view="list:${l.id}" data-lid="${l.id}"><span class="dot" style="background:${l.color}"></span>${esc(l.name)}<span class="cnt">${open.filter(x => x.listId === l.id).length || ''}</span></button>`).join('');
}

function titleText() {
  if (query) return `Поиск: ${query}`;
  const m = { today: 'Сегодня', tomorrow: 'Завтра', week: 'Ближайшие 7 дней', all: 'Все задачи', calendar: 'Календарь', done: 'Выполнено' };
  return m[view] || list(view.slice(5)).name;
}

function taskRow(x) {
  const l = list(x.listId), t = today();
  const subs = x.subs.length ? `<span>☰ ${x.subs.filter(s => s.done).length}/${x.subs.length}</span>` : '';
  const dt = x.date ? `<span class="${x.date < t && !x.done ? 'od' : x.date === t ? 'today' : ''}">${dateLabel(x.date)}${x.time ? ' ' + x.time : ''}</span>` : '';
  return `<div class="task ${x.done ? 'done' : ''} ${x.id === selId ? 'sel' : ''}" data-id="${x.id}">
    <button class="chk p${x.prio}" data-chk="${x.id}">${x.done ? '✓' : ''}</button>
    <span class="t">${esc(x.title)}</span>
    <span class="meta">${subs}${dt}<span class="dot" style="background:${l.color}" title="${esc(l.name)}"></span></span></div>`;
}

function renderTasks() {
  const items = visible().sort(cmp);
  let html = '';
  if (view === 'today' || view === 'week' || view === 'tomorrow' || query || view === 'all') {
    const groups = new Map();
    for (const x of items) {
      const t = today();
      const k = x.done ? 'Выполнено' : !x.date ? 'Без даты' : x.date < t ? 'Просрочено' : x.date;
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(x);
    }
    const order = [...groups.keys()].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
    const single = view === 'tomorrow' || (view === 'today' && order.every(k => k === 'Просрочено' || k === today()));
    for (const k of order) {
      const head = /^\d/.test(k) ? dateLabel(k) : k;
      html += `<div class="group">${single && /^\d/.test(k) ? '' : `<h3 class="${k === 'Просрочено' ? 'over' : ''}">${head}</h3>`}${groups.get(k).map(taskRow).join('')}</div>`;
    }
  } else html = `<div class="group">${items.map(taskRow).join('')}</div>`;
  $('#tasks').innerHTML = items.length ? html : `<div class="empty">Здесь пока пусто 🎉<br>Добавьте задачу выше</div>`;
}
function rank(k) { return k === 'Просрочено' ? 0 : /^\d/.test(k) ? 1 : k === 'Без даты' ? 2 : 3; }

function renderCal() {
  const box = $('#calendar');
  box.hidden = view !== 'calendar' || !!query;
  if (box.hidden) return;
  const y = calMonth.getFullYear(), m = calMonth.getMonth();
  const first = (new Date(y, m, 1).getDay() + 6) % 7;
  const start = addDays(new Date(y, m, 1), -first);
  const has = new Set(state.tasks.filter(x => !x.done && x.date).map(x => x.date));
  let cells = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map(d => `<div class="dow">${d}</div>`).join('');
  for (let i = 0; i < 42; i++) {
    const d = addDays(start, i), s = ymd(d);
    cells += `<button class="day ${d.getMonth() !== m ? 'other' : ''} ${s === today() ? 'today' : ''} ${s === calDay ? 'sel' : ''} ${has.has(s) ? 'has' : ''}" data-day="${s}">${d.getDate()}<i></i></button>`;
  }
  box.innerHTML = `<div class="cal-head"><button data-cal="-1">‹</button><span>${MONTHS[m]} ${y}</span><button data-cal="1">›</button></div><div class="cal-grid">${cells}</div>`;
}

function renderDetail() {
  const x = task(selId), box = $('#detail');
  if (!x) { box.hidden = true; return; }
  box.hidden = false;
  box.innerHTML = `
    <div class="actions" style="margin:0 0 8px"><button class="btn" id="dClose">← Закрыть</button><button class="btn" id="dDone">${x.done ? 'Вернуть' : '✓ Выполнить'}</button></div>
    <input id="dTitle" value="${esc(x.title)}" style="width:100%">
    <div class="row two"><div class="row" style="margin:0"><label>Дата</label><input type="date" id="dDate" value="${x.date || ''}"></div>
      <div class="row" style="margin:0"><label>Время</label><input type="time" id="dTime" value="${x.time || ''}"></div></div>
    <div class="row"><label>Приоритет</label><div class="prio">${[[0, 'Нет'], [3, 'Низкий'], [2, 'Средний'], [1, 'Высокий']].map(([p, n]) => `<button data-p="${p}" class="${x.prio === p ? 'on' : ''}">${n}</button>`).join('')}</div></div>
    <div class="row"><label>Список</label><select id="dList">${state.lists.map(l => `<option value="${l.id}" ${l.id === x.listId ? 'selected' : ''}>${esc(l.name)}</option>`).join('')}</select></div>
    <div class="row"><label>Подзадачи</label>
      ${x.subs.map(s => `<div class="sub ${s.done ? 'done' : ''}"><input type="checkbox" data-sc="${s.id}" ${s.done ? 'checked' : ''}><input type="text" data-st="${s.id}" value="${esc(s.t)}"><button class="x" data-sx="${s.id}">✕</button></div>`).join('')}
      <input id="dSub" placeholder="+ Добавить подзадачу"></div>
    <div class="row"><label>Заметки</label><textarea id="dNotes" placeholder="Описание…">${esc(x.notes)}</textarea></div>
    <div class="actions"><button class="btn danger" id="dDel">Удалить</button></div>`;
}

function render() {
  renderSide();
  $('#title').textContent = titleText();
  renderCal();
  renderTasks();
  renderDetail();
}
const touch = () => { save(); render(); };
// Update list/sidebar without destroying the focused detail inputs
const touchSoft = () => { save(); renderSide(); renderTasks(); renderCal(); };

// ---------- quick add parsing ----------
function parseQuick(text) {
  let title = text, date = null, time = null, prio = 0, listId = null;
  title = title.replace(/(^|\s)#([^\s#!]+)/g, (m, sp, name) => {
    const l = state.lists.find(l => l.name.toLowerCase() === name.toLowerCase());
    if (l) { listId = l.id; return sp; } return m;
  });
  title = title.replace(/(^|\s)!([1-3])(?=\s|$)/, (m, sp, p) => { prio = +p; return sp; });
  title = title.replace(/(^|\s)(?:в\s+)?(\d{1,2})[:.](\d{2})(?=\s|$)/i, (m, sp, h, mi) => { if (+h < 24 && +mi < 60) { time = `${pad(h)}:${mi}`; return sp; } return m; });
  const rel = [[/(^|\s)послезавтра(?=\s|$)/i, 2], [/(^|\s)завтра(?=\s|$)/i, 1], [/(^|\s)сегодня(?=\s|$)/i, 0]];
  for (const [re, n] of rel) if (re.test(title)) { date = ymd(addDays(new Date(), n)); title = title.replace(re, '$1'); break; }
  if (!date) {
    const dm = title.match(/(^|\s)(\d{1,2})\.(\d{1,2})(?:\.(\d{4}))?(?=\s|$)/);
    if (dm && +dm[2] <= 31 && +dm[3] <= 12) {
      const now = new Date(); let y = dm[4] ? +dm[4] : now.getFullYear(), d = new Date(y, +dm[3] - 1, +dm[2]);
      if (!dm[4] && ymd(d) < today()) d = new Date(y + 1, +dm[3] - 1, +dm[2]);
      date = ymd(d); title = title.replace(dm[0], dm[1]);
    }
  }
  if (!date) {
    const days = ['воскресенье', 'понедельник', 'вторник', 'среду|среда', 'четверг', 'пятницу|пятница', 'субботу|суббота'];
    for (let i = 0; i < 7; i++) {
      const re = new RegExp(`(^|\\s)(?:в\\s+)?(?:${days[i]})(?=\\s|$)`, 'i');
      if (re.test(title)) { let n = (i - new Date().getDay() + 7) % 7 || 7; date = ymd(addDays(new Date(), n)); title = title.replace(re, '$1'); break; }
    }
  }
  title = title.replace(/\s+/g, ' ').trim();
  return { title, date, time, prio, listId };
}

function addTask(text) {
  const p = parseQuick(text);
  if (!p.title) return;
  let listId = p.listId || (view.startsWith('list:') ? view.slice(5) : 'inbox');
  let date = p.date;
  if (!date) { if (view === 'today') date = today(); else if (view === 'tomorrow') date = ymd(addDays(new Date(), 1)); else if (view === 'calendar') date = calDay; }
  const x = { id: uid(), title: p.title, notes: '', date, time: p.time, prio: p.prio, listId, done: false, doneAt: null, subs: [], created: Date.now() };
  state.tasks.push(x);
  touch();
}

// ---------- events ----------
document.addEventListener('click', e => {
  const t = e.target;
  const nav = t.closest('[data-view]');
  if (nav) { view = nav.dataset.view; query = ''; $('#search').value = ''; selId = null; document.body.classList.remove('menu'); return render(); }
  const chk = t.closest('[data-chk]');
  if (chk) { toggle(chk.dataset.chk); return; }
  const row = t.closest('.task');
  if (row) { selId = row.dataset.id; return render(); }
  const day = t.closest('[data-day]');
  if (day) { calDay = day.dataset.day; return render(); }
  const cal = t.closest('[data-cal]');
  if (cal) { calMonth = new Date(calMonth.getFullYear(), calMonth.getMonth() + +cal.dataset.cal, 1); return render(); }
  if (t.id === 'menu') document.body.classList.add('menu');
  if (t.id === 'scrim') document.body.classList.remove('menu');
  if (t.id === 'addList') {
    const name = prompt('Название списка'); if (name && name.trim()) { state.lists.push({ id: uid(), name: name.trim(), color: COLORS[state.lists.length % COLORS.length] }); touch(); }
  }
  const x = task(selId);
  if (!x) return;
  if (t.id === 'dClose') { selId = null; render(); }
  if (t.id === 'dDone') toggle(x.id);
  if (t.id === 'dDel') { if (confirm('Удалить задачу?')) { state.tasks = state.tasks.filter(y => y.id !== x.id); selId = null; touch(); } }
  if (t.dataset.p !== undefined) { x.prio = +t.dataset.p; touch(); }
  if (t.dataset.sx) { x.subs = x.subs.filter(s => s.id !== t.dataset.sx); touch(); }
});

document.addEventListener('contextmenu', e => {
  const b = e.target.closest('[data-lid]');
  if (!b || b.dataset.lid === 'inbox') return;
  e.preventDefault();
  const l = list(b.dataset.lid);
  const n = prompt('Переименовать список (пусто — удалить)', l.name);
  if (n === null) return;
  if (!n.trim()) { if (confirm(`Удалить список «${l.name}» и его задачи?`)) { state.tasks = state.tasks.filter(t => t.listId !== l.id); state.lists = state.lists.filter(x => x !== l); if (view === 'list:' + l.id) view = 'today'; selId = null; touch(); } }
  else { l.name = n.trim(); touch(); }
});
// long-press for touch: rename/delete list
let lp; document.addEventListener('touchstart', e => { const b = e.target.closest('[data-lid]'); if (b) lp = setTimeout(() => b.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true })), 600); });
['touchend', 'touchmove'].forEach(ev => document.addEventListener(ev, () => clearTimeout(lp)));

function toggle(id) {
  const x = task(id); if (!x) return;
  x.done = !x.done; x.doneAt = x.done ? Date.now() : null;
  if (x.done && x.repeat) {}
  touch();
}

document.addEventListener('input', e => {
  const x = task(selId), t = e.target;
  if (t.id === 'search') { query = t.value.trim(); return render(); }
  if (!x) return;
  if (t.id === 'dTitle') { x.title = t.value; touchSoft(); }
  if (t.id === 'dNotes') { x.notes = t.value; save(); }
  if (t.dataset.st) { const s = x.subs.find(s => s.id === t.dataset.st); s.t = t.value; save(); }
});
document.addEventListener('change', e => {
  const x = task(selId), t = e.target;
  if (!x) return;
  if (t.id === 'dDate') { x.date = t.value || null; touch(); }
  if (t.id === 'dTime') { x.time = t.value || null; touch(); }
  if (t.id === 'dList') { x.listId = t.value; touch(); }
  if (t.dataset.sc) { const s = x.subs.find(s => s.id === t.dataset.sc); s.done = t.checked; touch(); }
});
document.addEventListener('keydown', e => {
  if (e.key === 'Enter' && e.target.id === 'dSub') {
    const x = task(selId), v = e.target.value.trim();
    if (x && v) { x.subs.push({ id: uid(), t: v, done: false }); touch(); $('#dSub').focus(); }
  }
  if (e.key === 'Escape') { if (selId) { selId = null; render(); } }
});
$('#quick').addEventListener('submit', e => {
  e.preventDefault();
  const i = $('#quickInput'); addTask(i.value); i.value = ''; i.focus();
});

render();
setInterval(renderSide, 60000);
