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
  try { const s = JSON.parse(localStorage.getItem(KEY)); if (s && s.tasks) { s.dead = s.dead || {}; s.habits = s.habits || []; s.focus = s.focus || []; return s; } } catch (e) {}
  return { dead: {}, habits: [], focus: [], lists: [{ id: 'inbox', name: 'Входящие', color: COLORS[0] }, { id: uid(), name: 'Работа', color: COLORS[2] }, { id: uid(), name: 'Личное', color: COLORS[3] }], tasks: [] };
}
const snap = {};
function stamp() {
  for (const it of [...state.lists, ...state.tasks, ...state.habits, ...state.focus]) {
    const j = JSON.stringify({ ...it, updated: 0 });
    if (snap[it.id] !== j) { if (snap[it.id] !== undefined || !it.updated) it.updated = Date.now(); snap[it.id] = j; }
  }
}
const save = (push = true) => { stamp(); try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {} if (push) schedulePush(); };
stamp();
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
  if (query) { const q = query.toLowerCase(); return r.filter(x => (x.title + ' ' + x.notes + ' ' + (x.tags || []).map(t => '#' + t).join(' ')).toLowerCase().includes(q)); }
  if (view === 'done') return r.filter(x => x.done).sort((a, b) => (b.doneAt || 0) - (a.doneAt || 0));
  r = r.filter(x => !x.done);
  if (view === 'today') return r.filter(x => x.date && x.date <= t);
  if (view === 'tomorrow') return r.filter(x => x.date === tm);
  if (view === 'week') return r.filter(x => x.date && x.date <= w);
  if (view === 'calendar') return calMode === 'week' ? [] : r.filter(x => x.date === calDay && !x.time);
  if (view.startsWith('list:')) return r.filter(x => x.listId === view.slice(5));
  if (view.startsWith('tag:')) return r.filter(x => (x.tags || []).includes(view.slice(4)));
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
    ['matrix', '🔲', 'Матрица', ''],
    ['focus', '🍅', 'Помодоро', pomo.running ? fmtSec(pomoLeft()) : ''],
    ['habits', '🔥', 'Привычки', state.habits.filter(h => !(h.checks || {})[t]).length || ''],
    ['done', '✅', 'Выполнено', ''],
    ['stats', '📊', 'Статистика', ''],
    ['settings', '⚙️', 'Настройки', '']
  ];
  $('#syncBtn').textContent = syncLabel();
  document.querySelectorAll('#tabbar [data-view]').forEach(b => b.classList.toggle('active', b.dataset.view === view));
  $('#fab').hidden = EXTRA.includes(view);
  $('#smart').innerHTML = smart.map(([id, ic, n, c]) => `<button class="nav ${view === id ? 'active' : ''}" data-view="${id}"><span>${ic}</span>${n}<span class="cnt">${c}</span></button>`).join('');
  const tagCount = {};
  for (const x of open) for (const tg of x.tags || []) tagCount[tg] = (tagCount[tg] || 0) + 1;
  const tagNames = Object.keys(tagCount).sort();
  $('#tags').innerHTML = tagNames.length ? `<div class="side-head"><span>Теги</span></div>` + tagNames.map(tg => `<button class="nav ${view === 'tag:' + tg ? 'active' : ''}" data-view="tag:${esc(tg)}"><span class="hash">#</span>${esc(tg)}<span class="cnt">${tagCount[tg]}</span></button>`).join('') : '';
  $('#lists').innerHTML = state.lists.map(l => `<button class="nav ${view === 'list:' + l.id ? 'active' : ''}" data-view="list:${l.id}" data-lid="${l.id}"><span class="dot" style="background:${l.color}"></span>${esc(l.name)}<span class="cnt">${open.filter(x => x.listId === l.id).length || ''}</span></button>`).join('');
}

function titleText() {
  if (query) return `Поиск: ${query}`;
  const m = { stats: 'Статистика', settings: 'Настройки', matrix: 'Матрица', focus: 'Помодоро', habits: 'Привычки', today: 'Сегодня', tomorrow: 'Завтра', week: 'Ближайшие 7 дней', all: 'Все задачи', calendar: 'Календарь', done: 'Выполнено' };
  if (view.startsWith('tag:')) return '#' + view.slice(4);
  return m[view] || list(view.slice(5)).name;
}

function taskRow(x) {
  const l = list(x.listId), t = today();
  const subs = x.subs.length ? `<span>☰ ${x.subs.filter(s => s.done).length}/${x.subs.length}</span>` : '';
  const dt = x.date ? `<span class="${x.date < t && !x.done ? 'od' : x.date === t ? 'today' : ''}">${dateLabel(x.date)}${x.time ? ' ' + x.time : ''}</span>` : '';
  return `<div class="task ${x.done ? 'done' : ''} ${x.id === selId ? 'sel' : ''}" data-id="${x.id}">
    <button class="chk p${x.prio}" data-chk="${x.id}">${x.done ? '✓' : ''}</button>
    <span class="t">${esc(x.title)}</span>
    <span class="meta">${(x.tags || []).slice(0, 2).map(tg => `<span class="tag">#${esc(tg)}</span>`).join('')}${subs}${dt}<span class="dot" style="background:${l.color}" title="${esc(l.name)}"></span></span></div>`;
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
    const single = view === 'tomorrow' || (view === 'today' && order.every(k => k === today()));
    for (const k of order) {
      const head = /^\d/.test(k) ? dateLabel(k) : k;
      const extraBtn = k === 'Просрочено' && !query ? `<button class="link" id="moveOver">Перенести на сегодня</button>` : '';
      html += `<div class="group">${single && /^\d/.test(k) ? '' : `<h3 class="${k === 'Просрочено' ? 'over' : ''}">${head}${extraBtn}</h3>`}${groups.get(k).map(taskRow).join('')}</div>`;
    }
    if (view === 'today' && !query) {
      const t = today(), doneToday = state.tasks.filter(x => x.done && (x.date === t || (x.doneAt && ymd(new Date(x.doneAt)) === t)));
      const total = items.length + doneToday.length;
      const cand = state.tasks.filter(x => !x.done && (!x.date || (x.date > t && x.date <= ymd(addDays(new Date(), 7))))).sort(cmp);
      const planBox = planOpen ? `<div class="plan"><h3>Что сделать сегодня? <button class="link" id="planDay">Готово</button></h3>${cand.length ? cand.map(x => `<div class="plan-row"><span class="t">${esc(x.title)}</span><span class="meta">${x.date ? dateLabel(x.date) : 'без даты'}</span><button class="btn sm" data-totoday="${x.id}">+ Сегодня</button></div>`).join('') : '<p class="hint">Нет задач на потом — всё уже распланировано 👍</p>'}</div>` : '';
      html = (cand.length || planOpen ? `<div class="plan-bar">${planOpen ? '' : `<button class="link" id="planDay">🗓 Спланировать день (${cand.length})</button>`}</div>` : '') + planBox + html;
      if (total) html = `<div class="prog"><div><b>${doneToday.length} из ${total}</b> выполнено сегодня${doneToday.length === total ? ' 🎉' : ''}</div><span><i style="width:${doneToday.length / total * 100}%"></i></span></div>` + html;
      if (doneToday.length) html += `<div class="group"><h3 class="fold" id="foldDone">${showDone ? '▾' : '▸'} Выполнено (${doneToday.length})</h3>${showDone ? doneToday.map(taskRow).join('') : ''}</div>`;
      if (!items.length && doneToday.length) { $('#tasks').innerHTML = html.replace('<div class="group">', '<div class="empty" style="padding:30px 0">Всё сделано! 🎉</div><div class="group">'); return; }
    }
  } else html = `<div class="group">${view === 'calendar' ? '<h3>Без времени</h3>' : ''}${items.map(taskRow).join('')}</div>`;
  if (view === 'calendar' && !items.length && !query) { $('#tasks').innerHTML = ''; return; }
  $('#tasks').innerHTML = items.length ? html : (view === 'today' && !query ? html : '') + `<div class="empty">Здесь пока пусто 🎉<br>Добавьте задачу выше</div>`;
}
let showDone = false, planOpen = false;
function rank(k) { return k === 'Просрочено' ? 0 : /^\d/.test(k) ? 1 : k === 'Без даты' ? 2 : 3; }

function renderCal() {
  const box = $('#calendar');
  box.hidden = view !== 'calendar' || !!query;
  if (box.hidden) return;
  const seg = `<div class="seg"><button data-cmode="month" class="${calMode === 'month' ? 'on' : ''}">Месяц + день</button><button data-cmode="week" class="${calMode === 'week' ? 'on' : ''}">Неделя</button></div>`;
  if (calMode === 'week') {
    const w = weekDays(), a = parse(w[0]), b = parse(w[6]);
    box.innerHTML = `${seg}<div class="cal-head"><button data-wk="-1">‹</button><span>${a.getDate()} ${MONTHS[a.getMonth()].slice(0, 3).toLowerCase()} – ${b.getDate()} ${MONTHS[b.getMonth()].slice(0, 3).toLowerCase()} ${b.getFullYear()}</span><button data-wk="1">›</button></div>`;
    return;
  }
  const y = calMonth.getFullYear(), m = calMonth.getMonth();
  const first = (new Date(y, m, 1).getDay() + 6) % 7;
  const start = addDays(new Date(y, m, 1), -first);
  const has = new Set(state.tasks.filter(x => !x.done && x.date).map(x => x.date));
  let cells = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map(d => `<div class="dow">${d}</div>`).join('');
  for (let i = 0; i < 42; i++) {
    const d = addDays(start, i), s = ymd(d);
    cells += `<button class="day ${d.getMonth() !== m ? 'other' : ''} ${s === today() ? 'today' : ''} ${s === calDay ? 'sel' : ''} ${has.has(s) ? 'has' : ''}" data-day="${s}">${d.getDate()}<i></i></button>`;
  }
  box.innerHTML = `${seg}<div class="cal-head"><button data-cal="-1">‹</button><span>${MONTHS[m]} ${y}</span><button data-cal="1">›</button></div><div class="cal-grid">${cells}</div>`;
}

function renderDetail() {
  const x = task(selId), box = $('#detail');
  if (!x) { box.hidden = true; return; }
  box.hidden = false;
  box.innerHTML = `
    <div class="actions" style="margin:0 0 8px"><button class="btn" id="dClose">← Закрыть</button><button class="btn" id="dFocus" title="Фокус на задаче">🍅</button><button class="btn" id="dDone">${x.done ? 'Вернуть' : '✓ Выполнить'}</button></div>
    <input id="dTitle" value="${esc(x.title)}" style="width:100%">
    <div class="row two"><div class="row" style="margin:0"><label>Дата</label><input type="date" id="dDate" value="${x.date || ''}"></div>
      <div class="row" style="margin:0"><label>Время</label><input type="time" id="dTime" value="${x.time || ''}"></div></div>
    <div class="qd">${[['0', 'Сегодня'], ['1', 'Завтра'], ['7', '+ неделя'], ['none', 'Без даты']].map(([v, n]) => `<button data-qd="${v}">${n}</button>`).join('')}</div>
    <div class="row"><label>Приоритет</label><div class="prio">${[[0, 'Нет'], [3, 'Низкий'], [2, 'Средний'], [1, 'Высокий']].map(([p, n]) => `<button data-p="${p}" class="${x.prio === p ? 'on' : ''}">${n}</button>`).join('')}</div></div>
    ${x.time ? `<div class="row"><label>Длительность</label><select id="dDur">${[15, 30, 45, 60, 90, 120, 180, 240, 480].map(m => `<option value="${m}" ${(x.dur || 60) === m ? 'selected' : ''}>${m < 60 ? m + ' мин' : (m / 60) + ' ч'}</option>`).join('')}</select></div>` : ''}
    <div class="two"><div class="row"><label>Повтор</label><select id="dRepeat">${[['', 'Нет'], ['daily', 'Каждый день'], ['weekdays', 'По будням'], ['weekly', 'Каждую неделю'], ['monthly', 'Каждый месяц'], ['yearly', 'Каждый год']].map(([v, n]) => `<option value="${v}" ${(x.repeat || '') === v ? 'selected' : ''}>${n}</option>`).join('')}</select></div>
    <div class="row"><label>Напоминание</label><select id="dRemind">${[['', 'Нет'], ['0', 'В момент'], ['10', 'За 10 мин'], ['60', 'За 1 час'], ['1440', 'За 1 день']].map(([v, n]) => `<option value="${v}" ${(x.remind ?? '') === v ? 'selected' : ''}>${n}</option>`).join('')}</select></div></div>
    <div class="row"><label>Список</label><select id="dList">${state.lists.map(l => `<option value="${l.id}" ${l.id === x.listId ? 'selected' : ''}>${esc(l.name)}</option>`).join('')}</select></div>
    <div class="row"><label>Теги</label><input id="dTags" placeholder="напр. спорт, учёба" value="${esc((x.tags || []).join(', '))}"></div>
    <div class="row"><label>Подзадачи</label>
      ${x.subs.map(s => `<div class="sub ${s.done ? 'done' : ''}"><input type="checkbox" data-sc="${s.id}" ${s.done ? 'checked' : ''}><input type="text" data-st="${s.id}" value="${esc(s.t)}"><button class="x" data-sx="${s.id}">✕</button></div>`).join('')}
      <input id="dSub" placeholder="+ Добавить подзадачу"></div>
    <div class="row"><label>Заметки</label><textarea id="dNotes" placeholder="Описание…">${esc(x.notes)}</textarea></div>
    <div class="actions"><button class="btn danger" id="dDel">Удалить</button></div>`;
}

function render() {
  renderSide();
  $('#title').textContent = titleText();
  const extra = EXTRA.includes(view) && !query;
  $('#quick').hidden = extra;
  renderCal();
  if (extra) $('#tasks').innerHTML = ''; else renderTasks();
  renderTimeline();
  renderExtra();
  renderDetail();
}
const touch = () => { save(); render(); };
// Update list/sidebar without destroying the focused detail inputs
const touchSoft = () => { save(); renderSide(); if (!EXTRA.includes(view) || query) renderTasks(); else renderExtra(); renderCal(); renderTimeline(); };

// ---------- quick add parsing ----------
function parseQuick(text) {
  let title = text, date = null, time = null, prio = 0, listId = null; const tags = [];
  title = title.replace(/(^|\s)#([^\s#!]+)/g, (m, sp, name) => {
    const l = state.lists.find(l => l.name.toLowerCase() === name.toLowerCase());
    if (l) { listId = l.id; return sp; }
    const tg = name.toLowerCase(); if (!tags.includes(tg)) tags.push(tg); return sp;
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
  return { title, date, time, prio, listId, tags };
}

function addTask(text) {
  const p = parseQuick(text);
  if (!p.title) return;
  let listId = p.listId || (view.startsWith('list:') ? view.slice(5) : 'inbox');
  let date = p.date;
  if (!date) { if (view === 'today') date = today(); else if (view === 'tomorrow') date = ymd(addDays(new Date(), 1)); else if (view === 'calendar') date = calDay; }
  const tags = [...p.tags]; if (view.startsWith('tag:') && !tags.includes(view.slice(4))) tags.push(view.slice(4));
  const x = { id: uid(), title: p.title, notes: '', date, time: p.time, prio: p.prio, listId, tags, done: false, doneAt: null, subs: [], created: Date.now() };
  state.tasks.push(x);
  touch();
}

// ---------- events ----------
document.addEventListener('click', e => {
  const t = e.target;
  const nav = t.closest('[data-view]');
  if (nav) { view = nav.dataset.view; query = ''; $('#search').value = ''; selId = null; document.body.classList.remove('menu'); return render(); }
  if (t.id === 'moveOver') { const td = today(), moved = state.tasks.filter(x => !x.done && x.date && x.date < td); const prev = moved.map(x => [x, x.date]); moved.forEach(x => x.date = td); touch(); undoToast(`Перенесено на сегодня: ${moved.length}`, () => { prev.forEach(([x, d]) => x.date = d); touch(); }); return; }
  if (t.id === 'foldDone') { showDone = !showDone; return renderTasks(); }
  if (t.id === 'planDay') { planOpen = !planOpen; return renderTasks(); }
  const tt = t.closest('[data-totoday]'); if (tt) { const x = task(tt.dataset.totoday); if (x) { x.date = today(); touch(); } return; }
  if (t.closest('#fab')) { const i = $('#quickInput'); $('#content').scrollTo({ top: 0, behavior: 'smooth' }); i.focus(); return; }
  if (swiped) { swiped = false; return; }
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
  if (t.id === 'dDel') removeTask(x.id);
  if (t.id === 'dFocus') { pomo.taskId = x.id; pomo.phase = 'work'; pomo.left = pomo.work * 60; pomo.endsAt = Date.now() + pomo.left * 1000; pomo.running = true; askNotify(); pomoSave(); selId = null; view = 'focus'; render(); pomoTick(); return; }
  if (t.dataset.qd !== undefined) { x.date = t.dataset.qd === 'none' ? null : ymd(addDays(new Date(), +t.dataset.qd)); touch(); }
  if (t.dataset.p !== undefined) { x.prio = +t.dataset.p; touch(); }
  if (t.dataset.sx) { x.subs = x.subs.filter(s => s.id !== t.dataset.sx); touch(); }
});

document.addEventListener('contextmenu', e => {
  if (e.target.closest('#timeline')) { e.preventDefault(); return; }
  const b = e.target.closest('[data-lid]');
  if (!b || b.dataset.lid === 'inbox') return;
  e.preventDefault();
  const l = list(b.dataset.lid);
  const n = prompt('Переименовать список (пусто — удалить)', l.name);
  if (n === null) return;
  if (!n.trim()) { if (confirm(`Удалить список «${l.name}» и его задачи?`)) { state.tasks.filter(t => t.listId === l.id).forEach(t => state.dead[t.id] = Date.now()); state.dead[l.id] = Date.now(); state.tasks = state.tasks.filter(t => t.listId !== l.id); state.lists = state.lists.filter(x => x !== l); if (view === 'list:' + l.id) view = 'today'; selId = null; touch(); } }
  else { l.name = n.trim(); touch(); }
});
// long-press for touch: rename/delete list
let lp; document.addEventListener('touchstart', e => { const b = e.target.closest('[data-lid]'); if (b) lp = setTimeout(() => b.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true })), 600); });
['touchend', 'touchmove'].forEach(ev => document.addEventListener(ev, () => clearTimeout(lp)));

function toggle(id) {
  const x = task(id); if (!x) return;
  let created = null;
  x.done = !x.done; x.doneAt = x.done ? Date.now() : null;
  if (x.done && x.repeat) {
    const base = x.date ? parse(x.date) : new Date();
    const n = new Date(base);
    if (x.repeat === 'daily') n.setDate(n.getDate() + 1);
    else if (x.repeat === 'weekdays') { do n.setDate(n.getDate() + 1); while ([0, 6].includes(n.getDay())); }
    else if (x.repeat === 'weekly') n.setDate(n.getDate() + 7);
    else if (x.repeat === 'monthly') n.setMonth(n.getMonth() + 1);
    else if (x.repeat === 'yearly') n.setFullYear(n.getFullYear() + 1);
    const nx = { ...x, id: uid(), date: ymd(n), done: false, doneAt: null, repeat: x.repeat, created: Date.now(), subs: x.subs.map(s => ({ ...s, id: uid(), done: false })) };
    state.tasks.push(nx); created = nx.id;
  }
  touch();
  if (x.done) {
    if (navigator.vibrate) navigator.vibrate(10);
    undoToast(`✓ «${x.title}» выполнено`, () => {
      x.done = false; x.doneAt = null;
      if (created) { state.dead[created] = Date.now(); state.tasks = state.tasks.filter(t => t.id !== created); }
      touch();
    });
  }
}
function removeTask(id) {
  const x = task(id); if (!x) return;
  state.dead[x.id] = Date.now(); state.tasks = state.tasks.filter(y => y.id !== x.id);
  if (selId === x.id) selId = null;
  touch();
  undoToast(`🗑 «${x.title}» удалено`, () => { x.updated = Date.now() + 1; state.tasks.push(x); touch(); });
}
let undoT = null;
function undoToast(msg, fn) {
  let el = $('#undo');
  if (!el) { el = document.createElement('div'); el.id = 'undo'; document.body.appendChild(el); }
  el.innerHTML = `<span>${esc(msg)}</span><button>Отменить</button>`;
  el.className = 'show';
  el.querySelector('button').onclick = () => { el.className = ''; clearTimeout(undoT); fn(); };
  clearTimeout(undoT); undoT = setTimeout(() => el.className = '', 5000);
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
  if (t.id === 'dDur') { x.dur = +t.value; touch(); }
  if (t.id === 'dRepeat') { x.repeat = t.value; touch(); }
  if (t.id === 'dRemind') { x.remind = t.value; touch(); if (t.value !== '') askNotify(); }
  if (t.id === 'dList') { x.listId = t.value; touch(); }
  if (t.id === 'dTags') { x.tags = [...new Set(t.value.split(/[,\s]+/).map(v => v.replace(/^#/, '').trim().toLowerCase()).filter(Boolean))]; touch(); }
  if (t.dataset.sc) { const s = x.subs.find(s => s.id === t.dataset.sc); s.done = t.checked; touch(); }
});
document.addEventListener('keydown', e => {
  if (e.key === 'Enter' && e.target.id === 'dSub') {
    const x = task(selId), v = e.target.value.trim();
    if (x && v) { x.subs.push({ id: uid(), t: v, done: false }); touch(); $('#dSub').focus(); }
  }
  if (e.key === 'Enter' && e.target.classList.contains('mx-add')) { addToQuad(e.target.value, +e.target.dataset.q); }
  if (e.key === 'Enter' && e.target.id === 'hbNew') { const v = e.target.value.trim(); if (v) { state.habits.push({ id: uid(), name: v, checks: {}, created: Date.now() }); touch(); $('#hbNew').focus(); } }
  if (e.key === 'Escape') { if (selId) { selId = null; render(); } }
});
$('#quick').addEventListener('submit', e => {
  e.preventDefault();
  const i = $('#quickInput'); addTask(i.value); i.value = ''; i.focus();
});


// ---------- sync ----------
const CFG = 'doer.sync';
const cfg = () => { try { return JSON.parse(localStorage.getItem(CFG)) || {}; } catch (e) { return {}; } };
let syncState = 'off', pushT = null, syncing = false, again = false;
function syncLabel() {
  return { off: '☁ Синхронизация выключена', ok: '☁ Синхронизировано', busy: '☁ Синхронизация…', err: '⚠ Ошибка синхронизации' }[syncState];
}
function baseUrl() { const c = cfg(); return (c.url || (location.protocol.startsWith('http') ? '' : '')).replace(/\/$/, ''); }
function schedulePush() { if (!cfg().key) return; clearTimeout(pushT); pushT = setTimeout(sync, 800); }
function mergeInto(remote) {
  const dead = { ...state.dead };
  for (const k in remote.dead || {}) dead[k] = Math.max(dead[k] || 0, remote.dead[k]);
  const merge = (a, b) => {
    const m = new Map();
    for (const it of [...a, ...b]) { const o = m.get(it.id); if (!o || (it.updated || 0) > (o.updated || 0)) m.set(it.id, it); }
    return [...m.values()].filter(it => (dead[it.id] || 0) < (it.updated || 1));
  };
  const lists = merge(state.lists, remote.lists || []);
  if (!lists.some(l => l.id === 'inbox')) lists.unshift({ id: 'inbox', name: 'Входящие', color: COLORS[0], updated: 1 });
  state = { dead, lists, tasks: merge(state.tasks, remote.tasks || []), habits: merge(state.habits, remote.habits || []), focus: merge(state.focus, remote.focus || []) };
  if (view.startsWith('list:') && !state.lists.some(l => 'list:' + l.id === view)) view = 'today';
  if (selId && !task(selId)) selId = null;
}
async function remoteExchange(c) {
  if (c.type === 'supabase') {
    const base = c.url.replace(/\/+$/, '') + '/rest/v1/rpc/';
    const h = { 'Content-Type': 'application/json', apikey: c.anon };
    if (c.anon.startsWith('eyJ')) h.Authorization = 'Bearer ' + c.anon;
    const r1 = await fetch(base + 'kunim_pull', { method: 'POST', headers: h, body: JSON.stringify({ k: c.key }) });
    if (!r1.ok) throw new Error('pull ' + r1.status + ' ' + (await r1.text()).slice(0, 200));
    const remote = await r1.json();
    if (remote && typeof remote === 'object') mergeInto(remote);
    const cutoff = Date.now() - 60 * 864e5;
    for (const k in state.dead) if (state.dead[k] < cutoff) delete state.dead[k];
    stamp();
    const r2 = await fetch(base + 'kunim_push', { method: 'POST', headers: h, body: JSON.stringify({ k: c.key, d: { ...state, rem: computeReminders() } }) });
    if (!r2.ok) throw new Error('push ' + r2.status + ' ' + (await r2.text()).slice(0, 200));
    return;
  }
  // own server (server.js)
  const r = await fetch((c.url || '').replace(/\/$/, '') + '/api/sync', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Sync-Key': c.key }, body: JSON.stringify(state) });
  if (!r.ok) throw new Error(r.status);
  mergeInto(await r.json());
}
let syncErr = '';
async function sync() {
  const c = cfg(); if (!c.key) { syncState = 'off'; return renderSide(); }
  if (syncing) { again = true; return; }
  syncing = true; syncState = 'busy'; renderSide();
  try {
    stamp();
    const focus = document.activeElement && document.activeElement.id;
    await remoteExchange(c);
    for (const k in snap) delete snap[k];
    stamp(); save(false);
    syncState = 'ok'; syncErr = ''; lastSync = Date.now();
    const typing = ['dTitle', 'dNotes', 'dSub', 'quickInput', 'search', 'sUrl', 'sAnon', 'sKey', 'hbNew', 'dTags'].includes(focus) || (document.activeElement || {}).dataset?.st || document.activeElement?.classList?.contains('mx-add');
    if (!typing) render(); else { renderSide(); }
  } catch (e) { syncState = 'err'; syncErr = String(e.message || e); renderSide(); if (view === 'settings') renderExtra(); }
  syncing = false;
  if (again) { again = false; schedulePush(); }
}
let lastSync = 0;
$('#syncBtn').addEventListener('click', () => { view = 'settings'; selId = null; document.body.classList.remove('menu'); render(); });
const VAPID_PUBLIC = 'BOgDQ0ftgCavahxOeQmHp778ehM0ufHMacWhjNIEPSU5fFswqZUXgo5mvishRs40vpmy-WtlHqXAM00oKIpO5Hk';
let testRem = null;
// Upcoming reminders for the server to send as push notifications (computed in this device's local time).
function computeReminders() {
  const now = Date.now(), out = [];
  for (const x of state.tasks) {
    if (x.done || !x.date || x.remind === undefined || x.remind === '') continue;
    const [h, m] = (x.time || '09:00').split(':').map(Number);
    const d = parse(x.date); d.setHours(h, m, 0, 0);
    const at = d.getTime() - +x.remind * 60000;
    if (at > now - 10 * 60000 && at < now + 14 * 864e5) out.push({ id: x.id, t: '⏰ ' + x.title, b: x.time ? `${dateLabel(x.date)} в ${x.time}` : dateLabel(x.date), at });
  }
  for (const h of state.habits) {
    if (!h.remindAt) continue;
    const [hh, mm] = h.remindAt.split(':').map(Number);
    for (let i = 0; i < 7; i++) {
      const d = addDays(new Date(), i); d.setHours(hh, mm, 0, 0);
      if ((h.checks || {})[ymd(d)]) continue;
      const at = d.getTime(); if (at > now - 10 * 60000) out.push({ id: 'h-' + h.id + '-' + ymd(d), t: '🔥 ' + h.name, b: 'Не забудьте отметить привычку', at });
    }
  }
  if (testRem) out.push(testRem);
  return out;
}
const pushOn = () => { try { return localStorage.getItem('kunim.push') === '1'; } catch (e) { return false; } };
const b64u = s => { const p = '='.repeat((4 - s.length % 4) % 4), b = atob((s + p).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from(b, c => c.charCodeAt(0)); };
async function sbRpc(fn, body) {
  const c = cfg(), h = { 'Content-Type': 'application/json', apikey: c.anon };
  if (c.anon.startsWith('eyJ')) h.Authorization = 'Bearer ' + c.anon;
  const r = await fetch(c.url.replace(/\/+$/, '') + '/rest/v1/rpc/' + fn, { method: 'POST', headers: h, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(fn + ' ' + r.status + ' ' + (await r.text()).slice(0, 200));
}
async function enablePush() {
  const c = cfg();
  if (c.type !== 'supabase' || !c.key) return alert('Сначала включите синхронизацию — уведомления работают через неё.');
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
    return alert('Здесь уведомления недоступны.\n\nНа айфоне: добавьте Күнім на экран «Домой» (Safari → Поделиться → На экран «Домой») и откройте его оттуда. Нужен iOS 16.4 или новее.');
  }
  try {
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') return alert('Уведомления запрещены. Разрешите их в настройках телефона: Настройки → Уведомления → Күнім.');
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64u(VAPID_PUBLIC) });
    await sbRpc('kunim_sub', { k: c.key, s: sub.toJSON() });
    localStorage.setItem('kunim.push', '1');
    await sync(); render();
    toast('🔔 Уведомления включены');
  } catch (e) { alert('Не получилось включить уведомления: ' + (e.message || e)); }
}
async function disablePush() {
  try {
    const reg = await navigator.serviceWorker.ready, sub = await reg.pushManager.getSubscription();
    if (sub) { try { await sbRpc('kunim_unsub', { e: sub.endpoint }); } catch (e) {} await sub.unsubscribe(); }
  } catch (e) {}
  localStorage.removeItem('kunim.push'); render(); toast('Уведомления выключены');
}
async function testPush() {
  testRem = { id: 'test-' + Date.now(), t: '🔔 Проверка уведомлений', b: 'Если вы это видите — всё работает!', at: Date.now() + 60000 };
  await sync();
  toast(syncState === 'ok' ? 'Через 1–2 минуты придёт уведомление. Можно закрыть приложение.' : '⚠ Нет связи — попробуйте позже');
  setTimeout(() => { testRem = null; }, 5 * 60000);
}
const SB_DEFAULT = { url: 'https://aeqozxyznklnyaouojak.supabase.co', anon: 'sb_publishable_MhEDPCJvj6ngU7u1wKlW_A_AAc9OtFf' };
const SQL_TEXT = `-- Күнім: синхронизация. Вставьте целиком в Supabase → SQL Editor → Run.
create table if not exists kunim_sync (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);
alter table kunim_sync enable row level security;
revoke all on table kunim_sync from anon, authenticated;

create or replace function kunim_pull(k text) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if length(k) < 16 then raise exception 'code too short'; end if;
  return (select data from kunim_sync where id = encode(sha256(convert_to(k, 'UTF8')), 'hex'));
end $$;

create or replace function kunim_push(k text, d jsonb) returns void
language plpgsql security definer set search_path = public as $$
begin
  if length(k) < 16 then raise exception 'code too short'; end if;
  insert into kunim_sync (id, data, updated_at)
  values (encode(sha256(convert_to(k, 'UTF8')), 'hex'), d, now())
  on conflict (id) do update set data = excluded.data, updated_at = now();
end $$;

revoke all on function kunim_pull(text) from public;
revoke all on function kunim_push(text, jsonb) from public;
grant execute on function kunim_pull(text) to anon, authenticated;
grant execute on function kunim_push(text, jsonb) to anon, authenticated;
`;
const randCode = () => { const a = new Uint8Array(18); crypto.getRandomValues(a); return Array.from(a, b => 'abcdefghijkmnpqrstuvwxyz23456789'[b % 32]).join(''); };
const encodeConn = c => 'KUNIM1:' + btoa(unescape(encodeURIComponent(JSON.stringify({ u: c.url, a: c.anon, k: c.key }))));
function decodeConn(s) { const m = s.trim().match(/KUNIM1:([A-Za-z0-9+/=]+)/); if (!m) return null; const o = JSON.parse(decodeURIComponent(escape(atob(m[1])))); return { type: 'supabase', url: o.u, anon: o.a, key: o.k }; }
function renderSyncSettings() {
  const c = cfg(), on = !!c.key;
  const status = !on ? 'выключена' : syncState === 'ok' ? `✓ работает${lastSync ? ' (' + new Date(lastSync).toTimeString().slice(0, 5) + ')' : ''}` : syncState === 'busy' ? 'синхронизация…' : syncState === 'err' ? '⚠ ошибка' : '…';
  return `<h3 class="sh">Синхронизация между устройствами</h3>
    <p class="hint">Статус: <b>${status}</b>${syncState === 'err' && syncErr ? `<br><small class="err">${esc(syncErr)}</small>` : ''}</p>
    ${on ? `<div class="p-btns" style="justify-content:flex-start">
        <button class="btn primary" id="sNow">↻ Синхронизировать</button>
        <button class="btn" id="sCopy">📋 Код для другого устройства</button>
        <button class="btn danger" id="sOff">Отключить</button></div>
      <h3 class="sh">Уведомления (даже когда приложение закрыто)</h3>
      ${pushOn() ? `<p class="hint">🔔 Включены на этом устройстве.</p><div class="p-btns" style="justify-content:flex-start"><button class="btn" id="pTest">Проверить</button><button class="btn danger" id="pOff">Выключить</button></div>`
        : `<div class="p-btns" style="justify-content:flex-start"><button class="btn primary" id="pOn">🔔 Включить уведомления</button></div><p class="hint">На айфоне работает, только если Күнім открыт с иконки на экране «Домой» (iOS 16.4+).</p>`}
      <p class="hint">Чтобы подключить телефон или ноутбук: нажмите «Код для другого устройства», отправьте его себе (например в Telegram «Избранное») и на другом устройстве нажмите «Вставить код подключения».</p>`
    : `<div class="p-btns" style="justify-content:flex-start"><button class="btn primary" id="sStart">☁ Включить синхронизацию</button><button class="btn" id="sPaste">📥 Вставить код подключения</button></div>
      <p class="hint"><b>Первое устройство:</b> нажмите «Включить синхронизацию».<br><b>Второе устройство:</b> нажмите «Вставить код подключения» и вставьте код с первого.</p>
      <details class="sb"><summary>Свой сервер Supabase (для опытных)</summary>
        <div class="row"><label>Project URL</label><input id="sUrl" placeholder="https://xxxx.supabase.co" value="${esc(c.url || '')}"></div>
        <div class="row"><label>Publishable / anon key</label><input id="sAnon" placeholder="sb_publishable_… или eyJ…" value="${esc(c.anon || '')}"></div>
        <div class="row"><label>Секретный код (придуман автоматически)</label><input id="sKey" value="${esc(c.key || randCode())}"></div>
        <div class="p-btns" style="justify-content:flex-start"><button class="btn" id="sSql">📋 Скопировать SQL</button><button class="btn primary" id="sOn">Подключить</button></div>
      </details>`}`;
}
async function copyText(t, okMsg) {
  try { await navigator.clipboard.writeText(t); toast(okMsg); } catch (e) { prompt('Скопируйте вручную:', t); }
}
document.addEventListener('click', async e => {
  const id = e.target.id;
  if (id === 'sNow') sync();
  if (id === 'pOn') enablePush();
  if (id === 'pOff') disablePush();
  if (id === 'pTest') testPush();
  if (id === 'sSql') copyText(SQL_TEXT, '✓ SQL скопирован');
  if (id === 'sCopy') copyText(encodeConn(cfg()), '✓ Код скопирован — вставьте его на другом устройстве');
  if (id === 'sOff') { if (confirm('Отключить синхронизацию на этом устройстве? Задачи останутся здесь.')) { localStorage.removeItem(CFG); syncState = 'off'; render(); } }
  if (id === 'sOn') {
    const c = { type: 'supabase', url: $('#sUrl').value.trim(), anon: $('#sAnon').value.trim(), key: $('#sKey').value.trim() };
    if (!/^https?:\/\/.+/.test(c.url)) return alert('Вставьте Project URL (начинается с https://)');
    if (c.anon.length < 20) return alert('Вставьте ключ (publishable или anon key)');
    if (c.key.length < 16) return alert('Секретный код должен быть не короче 16 символов');
    localStorage.setItem(CFG, JSON.stringify(c)); await sync(); render();
    toast(syncState === 'ok' ? '✓ Синхронизация подключена' : '⚠ Не получилось — проверьте данные');
  }
  if (id === 'sStart') {
    localStorage.setItem(CFG, JSON.stringify({ type: 'supabase', url: SB_DEFAULT.url, anon: SB_DEFAULT.anon, key: randCode() + randCode().slice(0, 6) }));
    await sync(); render();
    if (syncState === 'ok') { toast('✓ Синхронизация включена'); copyText(encodeConn(cfg()), '✓ Код для другого устройства скопирован'); }
    else toast('⚠ Не получилось подключиться — проверьте интернет');
  }
  if (id === 'sPaste') {
    const v = prompt('Вставьте код подключения (начинается с KUNIM1:)'); if (!v) return;
    let c; try { c = decodeConn(v); } catch (er) { c = null; }
    if (!c) return alert('Это не похоже на код подключения');
    localStorage.setItem(CFG, JSON.stringify(c)); await sync(); render();
    toast(syncState === 'ok' ? '✓ Устройство подключено, задачи объединены' : '⚠ Не получилось подключиться');
  }
});
window.addEventListener('online', sync);
document.addEventListener('visibilitychange', () => { if (!document.hidden) sync(); else if (pushT) { clearTimeout(pushT); pushT = null; sync(); } });
setInterval(() => { if (!document.hidden) sync(); }, 30000);

// ---------- reminders ----------
const FIRED = 'doer.fired';
const fired = new Set(JSON.parse(localStorage.getItem(FIRED) || '[]'));
function askNotify() { if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission(); }
function toast(msg) {
  const d = document.createElement('div'); d.className = 'toast'; d.textContent = msg; document.body.appendChild(d); setTimeout(() => d.remove(), 8000);
}
async function notify(x) {
  const body = (x.time ? x.time + ' · ' : '') + 'Напоминание';
  toast('⏰ ' + x.title + (x.time ? ' — ' + x.time : ''));
  if (!pushOn() && 'Notification' in window && Notification.permission === 'granted') {
    try { const reg = await navigator.serviceWorker?.getRegistration(); if (reg) return reg.showNotification(x.title, { body, tag: x.id, icon: 'icon.svg' }); } catch (e) {}
    new Notification(x.title, { body, tag: x.id });
  }
}
function checkReminders() {
  const now = Date.now(); let changed = false;
  for (const x of state.tasks) {
    if (x.done || !x.date || x.remind === undefined || x.remind === '') continue;
    const [h, m] = (x.time || '09:00').split(':').map(Number);
    const d = parse(x.date); d.setHours(h, m, 0, 0);
    const due = d.getTime() - +x.remind * 60000, key = x.id + '|' + x.date + '|' + (x.time || '') + '|' + x.remind;
    if (now >= due && now - due < 12 * 3600e3 && !fired.has(key)) { fired.add(key); changed = true; notify(x); }
  }
  if (changed) try { localStorage.setItem(FIRED, JSON.stringify([...fired].slice(-300))); } catch (e) {}
}
setInterval(checkReminders, 20000);

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => {});

// ---------- timeline: day / week by hours ----------
const HOUR = 56;
let tlKey = null, drag = null;
let calMode = (() => { try { return localStorage.getItem('doer.calmode') || 'month'; } catch (e) { return 'month'; } })();
const toMin = t => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
const fromMin = m => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
const nowMin = () => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); };
const W = '(100% - 56px)';
function layout(ev) {
  let cols = [], cluster = [], end = -1;
  const fin = () => cluster.forEach(o => o.n = cols.length);
  for (const o of ev) {
    if (o.s >= end && cluster.length) { fin(); cluster = []; cols = []; }
    let i = cols.findIndex(c => c <= o.s); if (i < 0) { i = cols.length; cols.push(0); }
    cols[i] = o.e; o.col = i; cluster.push(o); end = Math.max(end, o.e);
  }
  fin();
}
function weekDays() { const d = parse(calDay), mon = addDays(d, -((d.getDay() + 6) % 7)); return [...Array(7)].map((_, i) => ymd(addDays(mon, i))); }
const tlDays = () => calMode === 'week' ? weekDays() : [calDay];
function renderTimeline() {
  const box = $('#timeline');
  box.hidden = view !== 'calendar' || !!query;
  if (box.hidden) { tlKey = null; return; }
  if (drag) return;
  const days = tlDays(), D = days.length, key = calMode + days[0], t = today();
  const prev = box.querySelector('.tl-scroll');
  const keep = prev && tlKey === key ? prev.scrollTop : null;
  let hours = '', blocks = '', now = '', cols = '';
  for (let h = 0; h < 24; h++) hours += `<div class="tl-h" style="top:${h * HOUR}px"><span>${pad(h)}:00</span></div>`;
  for (let i = D > 1 ? 0 : 1; i < D; i++) cols += `<div class="tl-col" style="left:calc(52px + ${W} * ${i / D})"></div>`;
  days.forEach((d, di) => {
    const ev = state.tasks.filter(x => x.date === d && x.time).map(x => { const s = toMin(x.time); return { x, s, e: Math.min(1440, s + (x.dur || 60)) }; }).sort((a, b) => a.s - b.s || b.e - a.e);
    layout(ev);
    blocks += ev.map(o => `<div class="tl-ev ${D > 1 ? 'narrow' : ''} ${o.x.done ? 'done' : ''} ${o.x.id === selId ? 'sel' : ''}" data-ev="${o.x.id}" style="top:${o.s / 60 * HOUR}px;height:${Math.max(18, (o.e - o.s) / 60 * HOUR - 2)}px;left:calc(52px + ${W} * ${(di + o.col / o.n) / D});width:calc(${W} / ${D * o.n} - 3px);--c:${list(o.x.listId).color}"><b>${esc(o.x.title || 'Без названия')}</b><span>${o.x.time}–${fromMin(o.e)}</span><i class="rz" data-rz="${o.x.id}"></i></div>`).join('');
    if (d === t) now = `<div class="tl-now" style="top:${nowMin() / 60 * HOUR}px;left:calc(48px + ${W} * ${di / D});width:calc(${W} / ${D} + 4px)"></div>`;
  });
  let head = '';
  if (D > 1) head = `<div class="tl-days"><div></div>${days.map(d => { const dd = parse(d), ad = state.tasks.filter(x => x.date === d && !x.time && !x.done); return `<div class="tl-day ${d === t ? 'today' : ''}"><button data-wday="${d}"><small>${WD[dd.getDay()]}</small><b>${dd.getDate()}</b></button>${ad.slice(0, 2).map(x => `<span class="chip" data-chip="${x.id}">${esc(x.title)}</span>`).join('')}${ad.length > 2 ? `<span class="chip more" data-wday="${d}">+${ad.length - 2}</span>` : ''}</div>`; }).join('')}</div>`;
  const title = D > 1 ? '' : `<div class="tl-title">${dateLabel(calDay)} — по часам<small>Зажмите пустое место (или потяните), чтобы добавить задачу. Зажмите задачу, чтобы перенести; тяните за нижний край, чтобы изменить длительность.</small></div>`;
  box.innerHTML = `${title}<div class="tl-scroll ${D > 1 ? 'week' : ''}">${head}<div class="tl-grid" style="height:${24 * HOUR}px">${hours}${cols}${now}${blocks}</div></div>`;
  box.querySelector('.tl-scroll').scrollTop = keep ?? Math.max(0, (days.includes(t) ? nowMin() - 90 : 8 * 60) / 60 * HOUR);
  tlKey = key;
}
const tlMin = (y, grid) => (y - grid.getBoundingClientRect().top) / HOUR * 60;
const snapM = m => Math.max(0, Math.min(1440 - 15, Math.floor(m / 15) * 15));
function dayAt(x, grid) { const r = grid.getBoundingClientRect(), D = tlDays().length; return Math.max(0, Math.min(D - 1, Math.floor((x - r.left - 52) / ((r.width - 56) / D)))); }
const colLeft = di => `calc(52px + ${W} * ${di / tlDays().length})`;
const colWidth = () => `calc(${W} / ${tlDays().length} - 3px)`;
function activate() {
  if (!drag) return;
  drag.active = true;
  if (navigator.vibrate) navigator.vibrate(15);
  if (drag.kind === 'new') {
    drag.el = document.createElement('div'); drag.el.className = 'tl-ghost';
    drag.el.style.left = colLeft(drag.di); drag.el.style.width = colWidth(); drag.el.style.right = 'auto';
    drag.grid.appendChild(drag.el);
    drag.a = drag.start; drag.b = drag.start + 60; paintGhost();
  } else drag.el.classList.add('dragging');
}
function paintGhost() { drag.el.style.top = drag.a / 60 * HOUR + 'px'; drag.el.style.height = (drag.b - drag.a) / 60 * HOUR + 'px'; drag.el.textContent = `${fromMin(drag.a)}–${fromMin(drag.b)}`; }
function createAt(start, dur, date) {
  const x = { id: uid(), title: 'Новая задача', notes: '', date: date || calDay, time: fromMin(start), dur, prio: 0, listId: 'inbox', done: false, doneAt: null, subs: [], created: Date.now(), repeat: '', remind: '' };
  state.tasks.push(x); selId = x.id; touch();
  const i = $('#dTitle'); if (i) { i.focus(); i.select(); }
}
$('#timeline').addEventListener('pointerdown', e => {
  const grid = e.target.closest('.tl-grid'); if (!grid || e.button > 0) return;
  const rz = e.target.closest('[data-rz]'), evEl = e.target.closest('[data-ev]'), m = tlMin(e.clientY, grid);
  drag = { grid, x0: e.clientX, y0: e.clientY, touch: e.pointerType !== 'mouse', active: false, scroll: grid.closest('.tl-scroll'), days: tlDays() };
  if (rz) { drag.kind = 'resize'; drag.task = task(rz.dataset.rz); drag.el = rz.parentElement; activate(); e.preventDefault(); return; }
  if (evEl) { drag.kind = 'move'; drag.task = task(evEl.dataset.ev); drag.el = evEl; drag.off = m - toMin(drag.task.time); drag.di = drag.days.indexOf(drag.task.date); }
  else { drag.kind = 'new'; drag.start = snapM(m); drag.di = dayAt(e.clientX, grid); }
  if (drag.touch) drag.timer = setTimeout(activate, 350); else e.preventDefault();
});
window.addEventListener('pointermove', e => {
  if (!drag) return;
  const dist = Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0);
  if (!drag.active) {
    if (drag.touch) { if (dist > 8) { clearTimeout(drag.timer); drag = null; } return; }
    if (dist > 4) activate(); else return;
  }
  e.preventDefault();
  const m = tlMin(e.clientY, drag.grid), t = drag.task;
  if (drag.kind === 'new') { const c = snapM(m); drag.a = Math.min(drag.start, c); drag.b = Math.max(drag.start, c) + 15; paintGhost(); }
  if (drag.kind === 'move') {
    const dur = t.dur || 60;
    drag.ns = Math.max(0, Math.min(1440 - Math.min(dur, 60), Math.round((m - drag.off) / 15) * 15));
    drag.el.style.top = drag.ns / 60 * HOUR + 'px';
    drag.el.querySelector('span').textContent = `${fromMin(drag.ns)}–${fromMin(Math.min(1440, drag.ns + dur))}`;
    if (drag.days.length > 1) { const di = dayAt(e.clientX, drag.grid); if (di !== drag.di) { drag.di = di; drag.nday = drag.days[di]; drag.el.style.left = colLeft(di); drag.el.style.width = colWidth(); } }
  }
  if (drag.kind === 'resize') { const s0 = toMin(t.time); const end = Math.max(s0 + 15, Math.min(1440, Math.round(m / 15) * 15)); drag.nd = end - s0; drag.el.style.height = Math.max(18, drag.nd / 60 * HOUR - 2) + 'px'; drag.el.querySelector('span').textContent = `${t.time}–${fromMin(end)}`; }
  const r = drag.scroll.getBoundingClientRect();
  if (e.clientY < r.top + 30) drag.scroll.scrollTop -= 10; else if (e.clientY > r.bottom - 30) drag.scroll.scrollTop += 10;
}, { passive: false });
function endDrag(e, cancelled) {
  if (!drag) return;
  clearTimeout(drag.timer); const d = drag; drag = null;
  if (cancelled) return render();
  const date = d.days[d.di];
  if (!d.active) {
    if (d.kind === 'move') { selId = d.task.id; render(); }
    else if (d.kind === 'new' && !d.touch) createAt(d.start, 60, date);
    return;
  }
  if (d.kind === 'new') { d.el.remove(); createAt(d.a, d.b - d.a, date); }
  else if (d.kind === 'move' && (d.ns != null || d.nday)) { if (d.ns != null) d.task.time = fromMin(d.ns); if (d.nday) d.task.date = d.nday; touch(); }
  else if (d.kind === 'resize' && d.nd) { d.task.dur = d.nd; touch(); }
  else render();
}
window.addEventListener('pointerup', e => endDrag(e, false));
window.addEventListener('pointercancel', e => endDrag(e, !drag || !drag.active));
document.addEventListener('touchmove', e => { if (drag && drag.active) e.preventDefault(); }, { passive: false });
setInterval(() => { if (view === 'calendar' && !drag) renderTimeline(); }, 60000);
document.addEventListener('click', e => {
  const cm = e.target.closest('[data-cmode]');
  if (cm) { calMode = cm.dataset.cmode; try { localStorage.setItem('doer.calmode', calMode); } catch (er) {} return render(); }
  const wk = e.target.closest('[data-wk]');
  if (wk) { calDay = ymd(addDays(parse(calDay), 7 * +wk.dataset.wk)); const d = parse(calDay); calMonth = new Date(d.getFullYear(), d.getMonth(), 1); return render(); }
  const wd = e.target.closest('[data-wday]');
  if (wd) { calDay = wd.dataset.wday; calMode = 'month'; const d = parse(calDay); calMonth = new Date(d.getFullYear(), d.getMonth(), 1); return render(); }
  const ch = e.target.closest('[data-chip]');
  if (ch) { selId = ch.dataset.chip; render(); }
});


// ---------- premium: matrix, pomodoro, habits ----------
const EXTRA = ['matrix', 'focus', 'habits', 'stats', 'settings'];
const QUADS = [[1, 'Срочно и важно', '#e5484d'], [2, 'Важно, не срочно', '#f5a524'], [3, 'Срочно, не важно', '#4772fa'], [0, 'Не срочно и не важно', '#30a46c']];
function addToQuad(text, prio) {
  const p = parseQuick(text); if (!p.title) return;
  state.tasks.push({ id: uid(), title: p.title, notes: '', date: p.date, time: p.time, prio, listId: p.listId || 'inbox', done: false, doneAt: null, subs: [], created: Date.now(), repeat: '', remind: '' });
  touch(); const i = document.querySelector(`.mx-add[data-q="${prio}"]`); if (i) i.focus();
}
function renderMatrix() {
  const open = state.tasks.filter(x => !x.done).sort(cmp);
  return `<div class="mx">${QUADS.map(([p, n, c]) => { const items = open.filter(x => (x.prio || 0) === p); return `<div class="mxq" data-q="${p}" style="--c:${c}"><h4>${n}<span>${items.length || ''}</span></h4><div class="mxl">${items.map(taskRow).join('').replace(/class="task /g, 'draggable="true" class="task ')}</div><input class="mx-add" data-q="${p}" placeholder="+ Добавить"></div>`; }).join('')}</div>
    <p class="hint">Квадрат зависит от приоритета задачи: высокий → «Срочно и важно», средний → «Важно», низкий → «Срочно, не важно». На компьютере задачи можно перетаскивать между квадратами.</p>`;
}
document.addEventListener('dragstart', e => { const r = e.target.closest('.mxq .task'); if (r) e.dataTransfer.setData('text/plain', r.dataset.id); });
document.addEventListener('dragover', e => { if (e.target.closest('.mxq')) e.preventDefault(); });
document.addEventListener('drop', e => { const q = e.target.closest('.mxq'); if (!q) return; e.preventDefault(); const x = task(e.dataTransfer.getData('text/plain')); if (x) { x.prio = +q.dataset.q; touch(); } });

// Pomodoro
const PKEY = 'doer.pomo';
const pomo = Object.assign({ phase: 'work', running: false, endsAt: 0, left: 25 * 60, count: 0, taskId: '', work: 25 }, (() => { try { return JSON.parse(localStorage.getItem(PKEY)) || {}; } catch (e) { return {}; } })());
const pomoSave = () => { try { localStorage.setItem(PKEY, JSON.stringify(pomo)); } catch (e) {} };
const phaseMin = ph => ph === 'work' ? pomo.work : ph === 'short' ? 5 : 15;
const pomoLeft = () => pomo.running ? Math.max(0, Math.round((pomo.endsAt - Date.now()) / 1000)) : pomo.left;
const fmtSec = s => `${pad(Math.floor(s / 60))}:${pad(s % 60)}`;
const PHASE = { work: 'Фокус', short: 'Перерыв', long: 'Долгий перерыв' };
function alarm(title, body) {
  toast('🍅 ' + title);
  if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
  if ('Notification' in window && Notification.permission === 'granted') {
    navigator.serviceWorker?.getRegistration().then(r => r ? r.showNotification(title, { body, icon: 'icon.svg' }) : new Notification(title, { body })).catch(() => {});
  }
}
function pomoFinish() {
  if (pomo.phase === 'work') {
    const mins = pomo.work;
    state.focus.push({ id: uid(), start: pomo.endsAt - mins * 60000, mins, taskId: pomo.taskId, created: Date.now() });
    pomo.count++; pomo.phase = pomo.count % 4 === 0 ? 'long' : 'short';
    alarm('Помидор готов!', 'Время отдохнуть');
  } else { pomo.phase = 'work'; alarm('Перерыв окончен', 'Пора за работу'); }
  pomo.running = false; pomo.left = phaseMin(pomo.phase) * 60;
  pomoSave(); save(); render();
}
function pomoTick() {
  if (pomo.running && Date.now() >= pomo.endsAt) return pomoFinish();
  const el = $('#pTime');
  if (el) { const l = pomoLeft(), tot = phaseMin(pomo.phase) * 60; el.textContent = fmtSec(l); const ring = $('#pRing'); if (ring) ring.style.strokeDashoffset = (1 - l / tot) * 691; }
  document.title = pomo.running ? `${fmtSec(pomoLeft())} · ${PHASE[pomo.phase]}` : 'Күнім — планировщик дня';
}
setInterval(pomoTick, 1000);
function renderFocus() {
  const l = pomoLeft(), tot = phaseMin(pomo.phase) * 60, t = today();
  const opts = state.tasks.filter(x => !x.done && (!x.date || x.date <= ymd(addDays(new Date(), 1)))).sort(cmp);
  const dayMins = d => state.focus.filter(f => ymd(new Date(f.start)) === d).reduce((a, f) => a + f.mins, 0);
  const days = [...Array(7)].map((_, i) => ymd(addDays(new Date(), i - 6)));
  const mx = Math.max(25, ...days.map(dayMins));
  const todayF = state.focus.filter(f => ymd(new Date(f.start)) === t).sort((a, b) => b.start - a.start);
  return `<div class="pomo ${pomo.phase}">
    <div class="p-phase">${['work', 'short', 'long'].map(p => `<button data-ph="${p}" class="${pomo.phase === p ? 'on' : ''}">${PHASE[p]}</button>`).join('')}</div>
    <div class="p-clock"><svg viewBox="0 0 240 240"><circle cx="120" cy="120" r="110" class="p-bg"/><circle id="pRing" cx="120" cy="120" r="110" class="p-fg" style="stroke-dashoffset:${(1 - l / tot) * 691}"/></svg><div id="pTime">${fmtSec(l)}</div></div>
    <div class="p-btns"><button class="btn primary" data-pomo="toggle">${pomo.running ? '⏸ Пауза' : '▶ Старт'}</button><button class="btn" data-pomo="reset">↺ Сброс</button><button class="btn" data-pomo="skip">⏭ Пропустить</button></div>
    <div class="p-row"><label>Задача</label><select id="pTask"><option value="">— без задачи —</option>${opts.map(x => `<option value="${x.id}" ${x.id === pomo.taskId ? 'selected' : ''}>${esc(x.title)}</option>`).join('')}</select>
    <label>Длина</label><select id="pLen">${[15, 25, 30, 45, 50, 60].map(m => `<option ${m === pomo.work ? 'selected' : ''}>${m}</option>`).join('')}</select> мин</div>
  </div>
  <div class="stats">
    <div class="st"><b>${todayF.length}</b><span>помидоров сегодня</span></div>
    <div class="st"><b>${dayMins(t)}</b><span>минут фокуса сегодня</span></div>
    <div class="st"><b>${days.reduce((a, d) => a + dayMins(d), 0)}</b><span>минут за 7 дней</span></div>
  </div>
  <div class="bars">${days.map(d => `<div class="bar"><i style="height:${dayMins(d) / mx * 100}%"></i><small>${WD[parse(d).getDay()]}</small><em>${dayMins(d) || ''}</em></div>`).join('')}</div>
  ${todayF.length ? `<div class="group"><h3>Сегодня</h3>${todayF.map(f => `<div class="task"><span>🍅</span><span class="t">${esc(task(f.taskId)?.title || 'Фокус')}</span><span class="meta">${new Date(f.start).toTimeString().slice(0, 5)} · ${f.mins} мин</span></div>`).join('')}</div>` : ''}`;
}
document.addEventListener('click', e => {
  const b = e.target.closest('[data-pomo]'), ph = e.target.closest('[data-ph]');
  if (ph && !pomo.running) { pomo.phase = ph.dataset.ph; pomo.left = phaseMin(pomo.phase) * 60; pomoSave(); render(); }
  if (!b) return;
  const a = b.dataset.pomo;
  if (a === 'toggle') {
    if (pomo.running) { pomo.left = pomoLeft(); pomo.running = false; }
    else { askNotify(); pomo.endsAt = Date.now() + pomo.left * 1000; pomo.running = true; }
  }
  if (a === 'reset') { pomo.running = false; pomo.left = phaseMin(pomo.phase) * 60; }
  if (a === 'skip') { pomo.running = false; pomo.phase = pomo.phase === 'work' ? 'short' : 'work'; pomo.left = phaseMin(pomo.phase) * 60; }
  pomoSave(); render(); pomoTick();
});
document.addEventListener('change', e => {
  if (e.target.id === 'pTask') { pomo.taskId = e.target.value; pomoSave(); }
  if (e.target.id === 'pLen') { pomo.work = +e.target.value; if (!pomo.running && pomo.phase === 'work') pomo.left = pomo.work * 60; pomoSave(); render(); }
});

// Habits
function streak(h) {
  const c = h.checks || {}; let d = new Date(), n = 0;
  if (!c[ymd(d)]) d = addDays(d, -1);
  while (c[ymd(d)]) { n++; d = addDays(d, -1); }
  return n;
}
function renderHabits() {
  const days = [...Array(7)].map((_, i) => ymd(addDays(new Date(), i - 6))), t = today();
  const done = state.habits.filter(h => (h.checks || {})[t]).length;
  return `<input id="hbNew" class="hb-new" placeholder="+ Новая привычка">
    ${state.habits.length ? `<p class="hint">Сегодня: ${done} из ${state.habits.length} ✓</p>` : ''}
    ${state.habits.map(h => `<div class="hb">
      <div class="hb-top"><button class="hb-name" data-hbedit="${h.id}">${esc(h.name)}</button><button class="hb-bell" data-hbrem="${h.id}" title="Напоминание">${h.remindAt ? '🔔 ' + h.remindAt : '🔕'}</button><span class="hb-streak" title="Дней подряд">🔥 ${streak(h)}</span><span class="hb-total">всего ${Object.keys(h.checks || {}).length}</span></div>
      <div class="hb-week">${days.map(d => `<button class="hb-d ${(h.checks || {})[d] ? 'on' : ''} ${d === t ? 'now' : ''}" data-hb="${h.id}" data-d="${d}"><small>${WD[parse(d).getDay()]}</small><b>${(h.checks || {})[d] ? '✓' : parse(d).getDate()}</b></button>`).join('')}</div>
    </div>`).join('') || '<div class="empty">Добавьте первую привычку выше 👆<br>Отмечайте её каждый день и копите серию 🔥</div>'}
    ${state.habits.length ? '<p class="hint">Нажмите на название, чтобы переименовать или удалить.</p>' : ''}`;
}
document.addEventListener('click', e => {
  const d = e.target.closest('[data-hb]');
  if (d) { const h = state.habits.find(h => h.id === d.dataset.hb); h.checks = { ...(h.checks || {}) }; if (h.checks[d.dataset.d]) delete h.checks[d.dataset.d]; else { h.checks[d.dataset.d] = 1; if (navigator.vibrate) navigator.vibrate(10); } touch(); }
  const hr = e.target.closest('[data-hbrem]');
  if (hr) {
    const h = state.habits.find(h => h.id === hr.dataset.hbrem);
    const v = prompt('Во сколько напоминать? (например 12:00). Пусто — без напоминания', h.remindAt || '');
    if (v === null) return;
    const m = v.trim().match(/^(\d{1,2})[:.](\d{2})$/);
    if (v.trim() && !m) return alert('Напишите время так: 12:00');
    h.remindAt = m ? `${pad(+m[1])}:${m[2]}` : ''; touch();
    if (h.remindAt && !pushOn()) toast('Чтобы напоминания приходили, включите уведомления в Настройках');
  }
  const ed = e.target.closest('[data-hbedit]');
  if (ed) {
    const h = state.habits.find(h => h.id === ed.dataset.hbedit);
    const n = prompt('Название привычки (пусто — удалить)', h.name); if (n === null) return;
    if (!n.trim()) { if (confirm(`Удалить привычку «${h.name}»?`)) { state.dead[h.id] = Date.now(); state.habits = state.habits.filter(x => x !== h); touch(); } }
    else { h.name = n.trim(); touch(); }
  }
});

// Statistics
function renderStats() {
  const t = today(), done = state.tasks.filter(x => x.done && x.doneAt), open = state.tasks.filter(x => !x.done);
  const dayDone = d => done.filter(x => ymd(new Date(x.doneAt)) === d).length;
  const days = [...Array(14)].map((_, i) => ymd(addDays(new Date(), i - 13)));
  const mx = Math.max(1, ...days.map(dayDone));
  const week = days.slice(7), weekDone = week.reduce((a, d) => a + dayDone(d), 0);
  const planned = state.tasks.filter(x => x.date && x.date >= week[0] && x.date <= t);
  const rate = planned.length ? Math.round(planned.filter(x => x.done).length / planned.length * 100) : 0;
  const focusWeek = state.focus.filter(f => ymd(new Date(f.start)) >= week[0]).reduce((a, f) => a + f.mins, 0);
  const best = state.habits.reduce((a, h) => Math.max(a, streak(h)), 0);
  const card = (v, n) => `<div class="st"><b>${v}</b><span>${n}</span></div>`;
  return `<div class="stats s4">${card(dayDone(t), 'выполнено сегодня')}${card(weekDone, 'за 7 дней')}${card(rate + '%', 'план недели выполнен')}${card(open.filter(x => x.date && x.date < t).length, 'просрочено')}</div>
    <h3 class="sh">Выполнено по дням (2 недели)</h3>
    <div class="bars acc">${days.map(d => `<div class="bar"><i style="height:${dayDone(d) / mx * 100}%"></i><small>${parse(d).getDate()}</small><em>${dayDone(d) || ''}</em></div>`).join('')}</div>
    <h3 class="sh">По спискам</h3>
    <div class="lists-st">${state.lists.map(l => { const all = state.tasks.filter(x => x.listId === l.id), dn = all.filter(x => x.done).length; return `<div class="ls"><span class="dot" style="background:${l.color}"></span><span class="ln">${esc(l.name)}</span><span class="lp"><i style="width:${all.length ? dn / all.length * 100 : 0}%;background:${l.color}"></i></span><span class="lc">${dn}/${all.length}</span></div>`; }).join('')}</div>
    <div class="stats">${card(done.length, 'всего выполнено')}${card(focusWeek, 'минут фокуса за неделю')}${card('🔥 ' + best, 'лучшая серия привычек')}</div>`;
}

// Settings: theme + backup
const TKEY = 'doer.theme';
const ACCENTS = ['#4772fa', '#e5484d', '#30a46c', '#8e4ec6', '#f76b15', '#e93d82', '#0091b2', '#64748b'];
let theme = Object.assign({ mode: 'auto', accent: '#4772fa' }, (() => { try { return JSON.parse(localStorage.getItem(TKEY)) || {}; } catch (e) { return {}; } })());
function applyTheme() {
  const r = document.documentElement;
  if (theme.mode === 'auto') r.removeAttribute('data-theme'); else r.dataset.theme = theme.mode;
  r.style.setProperty('--accent', theme.accent);
  const m = document.querySelector('meta[name=theme-color]'); if (m) m.content = theme.accent;
}
applyTheme();
function renderSettings() {
  return `<div class="set">
    <h3 class="sh">Тема</h3>
    <div class="seg big">${[['auto', '🌗 Как в системе'], ['light', '☀️ Светлая'], ['dark', '🌙 Тёмная']].map(([v, n]) => `<button data-tmode="${v}" class="${theme.mode === v ? 'on' : ''}">${n}</button>`).join('')}</div>
    <h3 class="sh">Цвет</h3>
    <div class="sw">${ACCENTS.map(c => `<button data-acc="${c}" class="${theme.accent === c ? 'on' : ''}" style="background:${c}" aria-label="${c}"></button>`).join('')}</div>
    ${renderSyncSettings()}
    <h3 class="sh">Резервная копия</h3>
    <p class="hint">${cfg().key ? 'Задачи синхронизируются, но копия в файл не помешает.' : 'Задачи хранятся только на этом устройстве.'} Сохраняйте копию в файл, чтобы не потерять их, или чтобы перенести на другое устройство.</p>
    <div class="p-btns" style="justify-content:flex-start"><button class="btn primary" id="bkSave">⬇ Сохранить копию</button><button class="btn" id="bkLoad">⬆ Загрузить из файла</button></div>
    <input type="file" id="bkFile" accept=".json,application/json" hidden>
  </div>`;
}
document.addEventListener('click', e => {
  const tm = e.target.closest('[data-tmode]'), ac = e.target.closest('[data-acc]');
  if (tm || ac) {
    if (tm) theme.mode = tm.dataset.tmode; if (ac) theme.accent = ac.dataset.acc;
    try { localStorage.setItem(TKEY, JSON.stringify(theme)); } catch (er) {}
    applyTheme(); render();
  }
  if (e.target.id === 'bkSave') {
    const blob = new Blob([JSON.stringify(state, null, 1)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `kunim-${today()}.json`;
    document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }
  if (e.target.id === 'bkLoad') $('#bkFile').click();
});
document.addEventListener('change', e => {
  if (e.target.id !== 'bkFile' || !e.target.files[0]) return;
  e.target.files[0].text().then(txt => {
    const d = JSON.parse(txt);
    if (!d || !Array.isArray(d.tasks)) throw new Error();
    if (!confirm(`Загрузить копию: ${d.tasks.length} задач? Текущие задачи сохранятся, копия добавится к ним.`)) return;
    mergeInto({ dead: d.dead || {}, lists: d.lists || [], tasks: d.tasks, habits: d.habits || [], focus: d.focus || [] });
    touch(); toast('✓ Копия загружена');
  }).catch(() => alert('Не получилось прочитать файл'));
});

function renderExtra() {
  const box = $('#extra');
  const on = EXTRA.includes(view) && !query;
  box.hidden = !on; if (!on) return;
  if (document.activeElement && ['pTask', 'pLen', 'sUrl', 'sAnon', 'sKey'].includes(document.activeElement.id)) return;
  box.innerHTML = view === 'matrix' ? renderMatrix() : view === 'focus' ? renderFocus() : view === 'stats' ? renderStats() : view === 'settings' ? renderSettings() : renderHabits();
}

// ---------- swipe on task rows (phone) ----------
let sw = null, swiped = false;
document.addEventListener('touchstart', e => {
  const row = e.target.closest('.task[data-id]');
  if (!row || e.target.closest('[data-chk]') || e.touches.length > 1) return;
  sw = { row, x0: e.touches[0].clientX, y0: e.touches[0].clientY, dx: 0, on: false };
}, { passive: true });
document.addEventListener('touchmove', e => {
  if (!sw) return;
  const dx = e.touches[0].clientX - sw.x0, dy = e.touches[0].clientY - sw.y0;
  if (!sw.on) { if (Math.abs(dy) > 10) { sw = null; return; } if (Math.abs(dx) > 12) sw.on = true; else return; }
  sw.dx = dx;
  sw.row.style.transform = `translateX(${dx}px)`;
  sw.row.classList.toggle('sw-done', dx > 70); sw.row.classList.toggle('sw-del', dx < -70);
}, { passive: true });
document.addEventListener('touchend', () => {
  if (!sw) return;
  const { row, dx, on } = sw; sw = null;
  if (!on) return;
  swiped = true; setTimeout(() => swiped = false, 400);
  row.style.transition = 'transform .15s'; row.style.transform = '';
  if (dx > 70) toggle(row.dataset.id);
  else if (dx < -70) removeTask(row.dataset.id);
  else setTimeout(() => { row.style.transition = ''; row.classList.remove('sw-done', 'sw-del'); }, 160);
});

// ---------- first launch: sample tasks ----------
try {
  if (!state.tasks.length && !localStorage.getItem('kunim.welcome')) {
    const t = today();
    ['👋 Привет! Это Күнім — твой планировщик дня',
     '👉 Смахни задачу вправо — выполнено, влево — удалить',
     '✏️ Нажми на задачу: время, напоминание, подзадачи, теги',
     '⚡ Попробуй написать: «Спорт завтра в 18:00 !1 #здоровье»',
     '📆 В Календаре зажми пустое время, чтобы добавить задачу'].forEach((title, i) =>
      state.tasks.push({ id: 'welcome-' + i, title, notes: '', date: t, time: null, prio: 0, listId: 'inbox', tags: [], done: false, doneAt: null, subs: [], created: Date.now() + i }));
    localStorage.setItem('kunim.welcome', '1'); save();
  }
} catch (e) {}

render();
pomoTick();
checkReminders();
sync();
setInterval(renderSide, 60000);
