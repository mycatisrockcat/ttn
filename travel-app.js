// ===== GitHub 설정 =====
const TOKEN_KEY = 'diary_github_token';
const GH_OWNER_KEY = 'travel_gh_owner';
const GH_REPO_KEY = 'travel_gh_repo';
const GITHUB_BRANCH = 'main';

let GITHUB_OWNER = '';
let GITHUB_REPO = '';

function getToken(){ return localStorage.getItem(TOKEN_KEY) || ''; }

// ===== 상태 =====
let trips = [];          // [{id, name, ...overview fields}]
let tripIndexSha = null; // travel/index.json 의 sha
let currentTrip = null;  // 현재 열려있는 여행 데이터 전체
let currentTripSha = null;
let pendingGalleryPhotos = [];

// ===== 유틸 =====
function esc(s){ return (s||'').toString().replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function showToast(msg){ const t=document.getElementById('toast'); t.textContent=msg; t.classList.add('show'); setTimeout(()=>t.classList.remove('show'),2200); }
function setSyncStatus(state,msg){ document.getElementById('sync-dot').className='sync-dot '+state; document.getElementById('sync-msg').textContent=msg; }
function uid(){ return Date.now().toString(36)+Math.random().toString(36).slice(2,7); }

// ===== GitHub API =====
async function ghGet(path){
  const res = await fetch(`https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${path}`, {
    headers: { Authorization: `token ${getToken()}`, Accept: 'application/vnd.github.v3+json' }
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error('읽기 실패');
  return res.json();
}
async function ghPut(path, content, sha){
  const body = { message: `travel: ${path}`, content: btoa(unescape(encodeURIComponent(JSON.stringify(content, null, 2)))), branch: GITHUB_BRANCH };
  if (sha) body.sha = sha;
  const res = await fetch(`https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${path}`, {
    method: 'PUT',
    headers: { Authorization: `token ${getToken()}`, Accept: 'application/vnd.github.v3+json', 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error('저장 실패');
  return res.json();
}
async function ghDelete(path, sha){
  const res = await fetch(`https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${path}`, {
    method: 'DELETE',
    headers: { Authorization: `token ${getToken()}`, Accept: 'application/vnd.github.v3+json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: `travel: delete ${path}`, sha, branch: GITHUB_BRANCH })
  });
  if (!res.ok) throw new Error('삭제 실패');
}
function decodeContent(file){
  return JSON.parse(decodeURIComponent(escape(atob(file.content.replace(/\n/g,'')))));
}

// ===== 토큰 화면 =====
document.getElementById('token-btn').addEventListener('click', async () => {
  const owner = document.getElementById('gh-owner').value.trim();
  const repo = document.getElementById('gh-repo').value.trim();
  const token = document.getElementById('token-input').value.trim();
  if (!owner || !repo || !token) { alert('모든 항목을 입력해주세요.'); return; }
  try {
    const res = await fetch(`https://api.github.com/repos/${owner}/${repo}`, { headers: { Authorization: `token ${token}` } });
    if (!res.ok) throw new Error();
  } catch(e) { alert('GitHub 정보가 올바르지 않거나 저장소에 접근할 수 없어요.'); return; }
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(GH_OWNER_KEY, owner);
  localStorage.setItem(GH_REPO_KEY, repo);
  GITHUB_OWNER = owner; GITHUB_REPO = repo;
  showMain();
});

function showMain(){
  document.getElementById('token-screen').style.display='none';
  document.getElementById('main-screen').style.display='block';
  loadTripIndex();
}

// ===== 여행 목록 (index) =====
async function loadTripIndex(){
  setSyncStatus('saving','불러오는 중...');
  try {
    const file = await ghGet('travel/index.json');
    if (file) { tripIndexSha = file.sha; trips = decodeContent(file); }
    else { tripIndexSha = null; trips = []; }
    setSyncStatus('ok','동기화됨');
  } catch(e) { setSyncStatus('error','불러오기 실패'); trips = []; }
  renderTripList();
  showListScreen();
}

async function saveTripIndex(){
  setSyncStatus('saving','저장 중...');
  try {
    const res = await ghPut('travel/index.json', trips, tripIndexSha);
    tripIndexSha = res.content.sha;
    setSyncStatus('ok','저장 완료 ✓');
  } catch(e) { setSyncStatus('error','저장 실패'); }
}

function renderTripList(){
  const grid = document.getElementById('trip-grid');
  const empty = document.getElementById('empty-trips');
  grid.innerHTML = '';
  if (!trips.length) { empty.style.display=''; return; }
  empty.style.display='none';

  const statusColor = s => s==='완료' ? '#00ba7c' : s==='진행중' ? '#ffb800' : '#8b98a5';

  trips.forEach(trip => {
    const card = document.createElement('div');
    card.className = 'trip-card';
    card.innerHTML = `
      <div class="trip-card-img">${trip.cover ? `<img src="${trip.cover}">` : '<i class="ti ti-plane" style="font-size:28px;"></i>'}</div>
      <div class="trip-card-body">
        <div class="trip-card-name">${esc(trip.name||'이름 없음')}</div>
        <div class="trip-card-date">${esc(trip.start||'')} ~ ${esc(trip.end||'')}</div>
        <span class="trip-status" style="background:${statusColor(trip.status)};">${esc(trip.status||'예정')}</span>
      </div>`;
    card.addEventListener('click', () => openTrip(trip.id));
    grid.appendChild(card);
  });
}

// ===== 토큰/저장소 재설정 =====
document.getElementById('reset-token-btn').addEventListener('click', () => {
  const ownerNow = localStorage.getItem(GH_OWNER_KEY) || '(없음)';
  const repoNow = localStorage.getItem(GH_REPO_KEY) || '(없음)';
  const ok = confirm(`현재 설정\n사용자명: ${ownerNow}\n저장소: ${repoNow}\n\n설정을 초기화하고 다시 입력할까요?`);
  if (!ok) return;
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(GH_OWNER_KEY);
  localStorage.removeItem(GH_REPO_KEY);
  location.reload();
});

// ===== 새 여행 만들기 =====
document.getElementById('new-trip-btn').addEventListener('click', () => {
  document.getElementById('modal-trip-name').value = '';
  document.getElementById('modal-overlay').classList.add('show');
  document.getElementById('modal-trip-name').focus();
});
document.getElementById('modal-cancel').addEventListener('click', () => document.getElementById('modal-overlay').classList.remove('show'));
document.getElementById('modal-confirm').addEventListener('click', async () => {
  const name = document.getElementById('modal-trip-name').value.trim();
  if (!name) { alert('여행 이름을 입력해주세요.'); return; }
  const id = uid();
  trips.unshift({ id, name, start:'', end:'', status:'예정', cover:'' });
  document.getElementById('modal-overlay').classList.remove('show');
  renderTripList();
  await saveTripIndex();
  openTrip(id);
});
document.getElementById('modal-trip-name').addEventListener('keydown', e => { if (e.key==='Enter') document.getElementById('modal-confirm').click(); });

// ===== 화면 전환 =====
function showListScreen(){
  document.getElementById('list-screen').style.display='block';
  document.getElementById('detail-screen').style.display='none';
}
function showDetailScreen(){
  document.getElementById('list-screen').style.display='none';
  document.getElementById('detail-screen').style.display='block';
}
document.getElementById('back-btn').addEventListener('click', () => { showListScreen(); });

// ===== 여행 상세 열기 =====
async function openTrip(id){
  setSyncStatus('saving','불러오는 중...');
  try {
    const file = await ghGet(`travel/${id}.json`);
    if (file) { currentTripSha = file.sha; currentTrip = decodeContent(file); }
    else {
      currentTripSha = null;
      const meta = trips.find(t=>t.id===id) || {};
      currentTrip = { id, overview: { name: meta.name||'', destination:'', start:meta.start||'', end:meta.end||'', companions:'', budget:'', status:meta.status||'예정', cover:meta.cover||'', memo:'' }, schedule: [], expenses: [], checklist: { packing:[], booking:[], before:[] }, records: {}, exchangeRate: { currency:'', rate:'' } };
    }
    setSyncStatus('ok','동기화됨');
  } catch(e) { setSyncStatus('error','불러오기 실패'); return; }
  if (!currentTrip.records) currentTrip.records = {}; // 구버전 데이터 호환
  if (!currentTrip.exchangeRate) currentTrip.exchangeRate = { currency:'', rate:'' };
  // 구버전 records (photos/diary 단일) -> posts 배열로 마이그레이션
  Object.keys(currentTrip.records).forEach(date => {
    const r = currentTrip.records[date];
    if (!r.posts) {
      const posts = [];
      if ((r.photos && r.photos.length) || r.diary) {
        posts.push({ photos: r.photos||[], text: r.diary||'', timeStr: nowTimeStr(), ts: Date.now() });
      }
      currentTrip.records[date] = { posts };
    }
  });

  document.getElementById('detail-title').textContent = currentTrip.overview.name || '여행';
  fillOverviewForm();
  renderSchedule();
  renderBudget();
  renderChecklist();
  renderRecordDateBar();
  switchTab('overview');
  showDetailScreen();
}

async function saveCurrentTrip(){
  setSyncStatus('saving','저장 중...');
  try {
    const res = await ghPut(`travel/${currentTrip.id}.json`, currentTrip, currentTripSha);
    currentTripSha = res.content.sha;
    setSyncStatus('ok','저장 완료 ✓');
  } catch(e) { setSyncStatus('error','저장 실패'); }
}

// ===== 여행 삭제 =====
document.getElementById('delete-trip-btn').addEventListener('click', async () => {
  if (!confirm('이 여행을 삭제할까요? 되돌릴 수 없어요.')) return;
  try {
    if (currentTripSha) await ghDelete(`travel/${currentTrip.id}.json`, currentTripSha);
  } catch(e) { /* 파일이 없을 수도 있음, 무시 */ }
  trips = trips.filter(t => t.id !== currentTrip.id);
  await saveTripIndex();
  renderTripList();
  showListScreen();
  showToast('삭제됐어요.');
});

// ===== 탭 전환 =====
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => switchTab(btn.dataset.tab));
});
function switchTab(tab){
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab===tab));
  document.querySelectorAll('.tab-content').forEach(c => c.classList.toggle('active', c.id==='tab-'+tab));
  if (tab === 'record') renderRecordDateBar();
}

// ===== 개요 탭 =====
function fillOverviewForm(){
  const ov = currentTrip.overview;
  document.getElementById('ov-name').value = ov.name||'';
  document.getElementById('ov-destination').value = ov.destination||'';
  document.getElementById('ov-start').value = ov.start||'';
  document.getElementById('ov-end').value = ov.end||'';
  document.getElementById('ov-companions').value = ov.companions||'';
  document.getElementById('ov-budget').value = ov.budget||'';
  document.getElementById('ov-status').value = ov.status||'예정';
  document.getElementById('ov-cover').value = ov.cover||'';
  document.getElementById('ov-memo').value = ov.memo||'';
}
document.getElementById('ov-save-btn').addEventListener('click', async () => {
  currentTrip.overview = {
    name: document.getElementById('ov-name').value.trim(),
    destination: document.getElementById('ov-destination').value.trim(),
    start: document.getElementById('ov-start').value,
    end: document.getElementById('ov-end').value,
    companions: document.getElementById('ov-companions').value.trim(),
    budget: document.getElementById('ov-budget').value,
    status: document.getElementById('ov-status').value,
    cover: document.getElementById('ov-cover').value.trim(),
    memo: document.getElementById('ov-memo').value
  };
  document.getElementById('detail-title').textContent = currentTrip.overview.name || '여행';
  // index.json에도 요약 정보 동기화
  const idx = trips.findIndex(t => t.id === currentTrip.id);
  if (idx > -1) {
    trips[idx] = { ...trips[idx], name: currentTrip.overview.name, start: currentTrip.overview.start, end: currentTrip.overview.end, status: currentTrip.overview.status, cover: currentTrip.overview.cover };
  }
  await saveCurrentTrip();
  await saveTripIndex();
  showToast('저장됐어요!');
});

// ===== 일정 탭 =====
function renderSchedule(){
  const container = document.getElementById('schedule-days');
  container.innerHTML = '';
  if (!currentTrip.schedule.length) {
    container.innerHTML = '<div class="empty-msg">날짜를 추가해서 일정을 기록해보세요.</div>';
    return;
  }
  currentTrip.schedule.forEach((day, di) => {
    const block = document.createElement('div');
    block.className = 'day-block';
    block.innerHTML = `
      <div class="day-block-header">
        <input type="date" value="${day.date||''}" data-di="${di}" class="sched-date-inp">
        <button class="icon-del-btn" data-di="${di}" data-action="del-day"><i class="ti ti-trash" style="font-size:15px;"></i></button>
      </div>
      <div class="sched-items" data-di="${di}"></div>
      <button class="add-row-btn" data-di="${di}" data-action="add-item">+ 일정 추가</button>`;
    container.appendChild(block);

    const itemsWrap = block.querySelector('.sched-items');
    (day.items||[]).forEach((item, ii) => {
      const row = document.createElement('div');
      row.className = 'sched-row-wrap';
      row.innerHTML = `
        <div class="sched-row">
          <input type="time" value="${item.time||''}" data-di="${di}" data-ii="${ii}" class="sched-time-inp">
          <input type="text" value="${esc(item.content||'')}" placeholder="내용" data-di="${di}" data-ii="${ii}" class="sched-content-inp">
          <button class="icon-del-btn" data-di="${di}" data-ii="${ii}" data-action="del-item"><i class="ti ti-x" style="font-size:14px;"></i></button>
        </div>
        <div class="sched-place-row">
          <input type="text" value="${esc(item.place||'')}" placeholder="장소명" data-di="${di}" data-ii="${ii}" class="sched-place-inp">
          <input type="text" value="${esc(item.mapUrl||'')}" placeholder="구글맵 링크" data-di="${di}" data-ii="${ii}" class="sched-mapurl-inp">
        </div>`;
      itemsWrap.appendChild(row);
    });
  });

  // 이벤트 바인딩
  container.querySelectorAll('.sched-date-inp').forEach(inp => inp.addEventListener('change', e => {
    currentTrip.schedule[+e.target.dataset.di].date = e.target.value; renderRecordDateBar(); saveCurrentTrip();
  }));
  container.querySelectorAll('.sched-time-inp').forEach(inp => inp.addEventListener('change', e => {
    const di=+e.target.dataset.di, ii=+e.target.dataset.ii;
    currentTrip.schedule[di].items[ii].time = e.target.value; saveCurrentTrip();
  }));
  container.querySelectorAll('.sched-content-inp').forEach(inp => inp.addEventListener('change', e => {
    const di=+e.target.dataset.di, ii=+e.target.dataset.ii;
    currentTrip.schedule[di].items[ii].content = e.target.value; saveCurrentTrip();
  }));
  container.querySelectorAll('.sched-place-inp').forEach(inp => inp.addEventListener('change', e => {
    const di=+e.target.dataset.di, ii=+e.target.dataset.ii;
    currentTrip.schedule[di].items[ii].place = e.target.value; saveCurrentTrip();
  }));
  container.querySelectorAll('.sched-mapurl-inp').forEach(inp => inp.addEventListener('change', e => {
    const di=+e.target.dataset.di, ii=+e.target.dataset.ii;
    currentTrip.schedule[di].items[ii].mapUrl = e.target.value; saveCurrentTrip();
  }));
  container.querySelectorAll('[data-action="del-day"]').forEach(btn => btn.addEventListener('click', async e => {
    currentTrip.schedule.splice(+e.currentTarget.dataset.di, 1); renderSchedule(); renderRecordDateBar(); await saveCurrentTrip();
  }));
  container.querySelectorAll('[data-action="add-item"]').forEach(btn => btn.addEventListener('click', async e => {
    const di = +e.currentTarget.dataset.di;
    if (!currentTrip.schedule[di].items) currentTrip.schedule[di].items = [];
    currentTrip.schedule[di].items.push({ time:'', content:'', place:'', mapUrl:'' });
    renderSchedule(); await saveCurrentTrip();
  }));
  container.querySelectorAll('[data-action="del-item"]').forEach(btn => btn.addEventListener('click', async e => {
    const di=+e.currentTarget.dataset.di, ii=+e.currentTarget.dataset.ii;
    currentTrip.schedule[di].items.splice(ii,1); renderSchedule(); await saveCurrentTrip();
  }));
}
document.getElementById('add-day-btn').addEventListener('click', async () => {
  currentTrip.schedule.push({ date:'', items:[] });
  renderSchedule();
  await saveCurrentTrip();
});

// ===== 가계부 탭 =====
const EXPENSE_CATEGORIES = ['교통','숙박','식비','관광','쇼핑','기타'];

function getRate(){ return Number(currentTrip.exchangeRate.rate) || 0; }
function getCurrencyLabel(){ return currentTrip.exchangeRate.currency || '현지화폐'; }

function fillExchangeRateForm(){
  document.getElementById('budget-currency').value = currentTrip.exchangeRate.currency || '';
  document.getElementById('budget-rate').value = currentTrip.exchangeRate.rate || '';
}
document.getElementById('budget-currency').addEventListener('change', e => {
  currentTrip.exchangeRate.currency = e.target.value.trim();
  renderBudget(); saveCurrentTrip();
});
document.getElementById('budget-rate').addEventListener('change', e => {
  currentTrip.exchangeRate.rate = e.target.value;
  renderBudget(); saveCurrentTrip();
});

function renderBudget(){
  fillExchangeRateForm();
  const summary = document.getElementById('budget-summary');
  const rowsWrap = document.getElementById('expense-rows');
  rowsWrap.innerHTML = '';

  const rate = getRate();
  const currency = getCurrencyLabel();

  let totals = {};
  let grandTotalLocal = 0;
  currentTrip.expenses.forEach(e => {
    const amt = Number(e.amount)||0;
    totals[e.category] = (totals[e.category]||0) + amt;
    grandTotalLocal += amt;
  });
  const grandTotalKrw = grandTotalLocal * rate;

  summary.innerHTML = `<div class="budget-stat"><div class="label">총 지출</div><div class="value">${grandTotalLocal.toLocaleString()} ${esc(currency)}</div>${rate?`<div class="sub-value">≈ ${Math.round(grandTotalKrw).toLocaleString()}원</div>`:''}</div>` +
    Object.entries(totals).map(([cat,amt]) => `<div class="budget-stat"><div class="label">${esc(cat)}</div><div class="value">${amt.toLocaleString()} ${esc(currency)}</div>${rate?`<div class="sub-value">≈ ${Math.round(amt*rate).toLocaleString()}원</div>`:''}</div>`).join('');

  if (!currentTrip.expenses.length) {
    rowsWrap.innerHTML = '<div class="empty-msg">지출 내역을 추가해보세요.</div>';
    return;
  }

  currentTrip.expenses.forEach((exp, i) => {
    const krw = (Number(exp.amount)||0) * rate;
    const row = document.createElement('div');
    row.className = 'expense-row';
    row.innerHTML = `
      <select data-i="${i}" class="exp-cat-inp">${EXPENSE_CATEGORIES.map(c=>`<option value="${c}" ${exp.category===c?'selected':''}>${c}</option>`).join('')}</select>
      <input type="text" value="${esc(exp.item||'')}" placeholder="항목" data-i="${i}" class="exp-item-inp">
      <input type="number" value="${exp.amount||''}" placeholder="${esc(currency)}" data-i="${i}" class="exp-amt-inp">
      <span class="expense-krw-hint">${rate ? `(${Math.round(krw).toLocaleString()}원)` : ''}</span>
      <button class="icon-del-btn" data-i="${i}" data-action="del-exp"><i class="ti ti-x" style="font-size:14px;"></i></button>`;
    rowsWrap.appendChild(row);
  });

  rowsWrap.querySelectorAll('.exp-cat-inp').forEach(el => el.addEventListener('change', e => { currentTrip.expenses[+e.target.dataset.i].category = e.target.value; renderBudget(); saveCurrentTrip(); }));
  rowsWrap.querySelectorAll('.exp-item-inp').forEach(el => el.addEventListener('change', e => { currentTrip.expenses[+e.target.dataset.i].item = e.target.value; saveCurrentTrip(); }));
  rowsWrap.querySelectorAll('.exp-amt-inp').forEach(el => el.addEventListener('change', e => { currentTrip.expenses[+e.target.dataset.i].amount = e.target.value; renderBudget(); saveCurrentTrip(); }));
  rowsWrap.querySelectorAll('[data-action="del-exp"]').forEach(btn => btn.addEventListener('click', async e => {
    currentTrip.expenses.splice(+e.currentTarget.dataset.i, 1); renderBudget(); await saveCurrentTrip();
  }));
}
document.getElementById('add-expense-btn').addEventListener('click', async () => {
  currentTrip.expenses.push({ category:'교통', item:'', amount:'' });
  renderBudget();
  await saveCurrentTrip();
});

// ===== 체크리스트 탭 =====
const CHECK_SECTIONS = ['packing','booking','before'];
function renderChecklist(){
  CHECK_SECTIONS.forEach(sec => {
    const wrap = document.getElementById('check-'+sec);
    wrap.innerHTML = '';
    (currentTrip.checklist[sec]||[]).forEach((item, i) => {
      const row = document.createElement('div');
      row.className = 'check-row' + (item.done ? ' done' : '');
      row.innerHTML = `
        <input type="checkbox" ${item.done?'checked':''} data-sec="${sec}" data-i="${i}" class="check-box-inp">
        <input type="text" value="${esc(item.text||'')}" data-sec="${sec}" data-i="${i}" class="check-text-inp">
        <button class="icon-del-btn" data-sec="${sec}" data-i="${i}" data-action="del-check"><i class="ti ti-x" style="font-size:14px;"></i></button>`;
      wrap.appendChild(row);
    });
  });

  document.querySelectorAll('.check-box-inp').forEach(el => el.addEventListener('change', async e => {
    const sec=e.target.dataset.sec, i=+e.target.dataset.i;
    currentTrip.checklist[sec][i].done = e.target.checked;
    renderChecklist(); await saveCurrentTrip();
  }));
  document.querySelectorAll('.check-text-inp').forEach(el => el.addEventListener('change', e => {
    const sec=e.target.dataset.sec, i=+e.target.dataset.i;
    currentTrip.checklist[sec][i].text = e.target.value; saveCurrentTrip();
  }));
  document.querySelectorAll('[data-action="del-check"]').forEach(btn => btn.addEventListener('click', async e => {
    const sec=e.currentTarget.dataset.sec, i=+e.currentTarget.dataset.i;
    currentTrip.checklist[sec].splice(i,1); renderChecklist(); await saveCurrentTrip();
  }));
}
document.querySelectorAll('[data-section]').forEach(btn => {
  btn.addEventListener('click', async () => {
    const sec = btn.dataset.section;
    if (!currentTrip.checklist[sec]) currentTrip.checklist[sec] = [];
    currentTrip.checklist[sec].push({ text:'', done:false });
    renderChecklist();
    await saveCurrentTrip();
  });
});

// ===== 기록 탭 =====
let activeRecordDate = null;
let pendingRecordPhotos = [];

function getAllScheduleDates(){
  return currentTrip.schedule
    .map(d => d.date)
    .filter(Boolean)
    .sort();
}

function renderRecordDateBar(){
  const bar = document.getElementById('record-date-bar');
  const layout = document.getElementById('record-layout');
  const emptyMsg = document.getElementById('record-empty-msg');
  bar.innerHTML = '';

  const dates = getAllScheduleDates();
  if (!dates.length) {
    layout.style.display = 'none';
    emptyMsg.style.display = '';
    return;
  }
  emptyMsg.style.display = 'none';

  if (!activeRecordDate || !dates.includes(activeRecordDate)) activeRecordDate = dates[0];

  dates.forEach(date => {
    const chip = document.createElement('button');
    chip.className = 'record-date-chip' + (date === activeRecordDate ? ' active' : '');
    chip.textContent = date;
    chip.addEventListener('click', () => { activeRecordDate = date; pendingRecordPhotos=[]; renderRecordDateBar(); renderRecordContent(); });
    bar.appendChild(chip);
  });

  layout.style.display = 'grid';
  renderRecordContent();
}

function nowTimeStr(){ const d = new Date(); return d.toTimeString().slice(0,5); }

function renderRecordContent(){
  if (!activeRecordDate) return;
  if (!currentTrip.records[activeRecordDate]) currentTrip.records[activeRecordDate] = { posts: [] };

  // 타임라인 (해당 날짜의 일정 자동 불러오기)
  const timelineWrap = document.getElementById('record-timeline');
  const day = currentTrip.schedule.find(d => d.date === activeRecordDate);
  const items = (day && day.items) ? [...day.items].sort((a,b) => (a.time||'').localeCompare(b.time||'')) : [];
  if (!items.length) {
    timelineWrap.innerHTML = '<div class="empty-msg" style="padding:1rem 0;">이 날짜에 등록된 일정이 없어요.</div>';
  } else {
    timelineWrap.innerHTML = items.map(it => `
      <div class="timeline-item">
        <div class="timeline-time">${esc(it.time||'')}</div>
        <div class="timeline-content">${esc(it.content||'')}${it.place ? ` <span style="color:var(--text3);">· ${esc(it.place)}</span>` : ''}</div>
      </div>`).join('');
  }

  document.getElementById('record-diary-input').value = '';
  document.getElementById('record-time-input').value = nowTimeStr();
  renderPendingPhotos();
  renderRecordPosts();
}

// 작성창 - 첨부 대기 중인 사진들
function renderPendingPhotos(){
  const wrap = document.getElementById('record-pending-photos');
  if (!pendingRecordPhotos.length) { wrap.style.display='none'; wrap.innerHTML=''; return; }
  wrap.style.display = 'grid';
  wrap.innerHTML = '';
  pendingRecordPhotos.forEach((src, i) => {
    const card = document.createElement('div');
    card.className = 'gallery-card';
    card.innerHTML = `<img src="${src}"><button class="gallery-del" data-i="${i}"><i class="ti ti-x" style="font-size:13px;"></i></button>`;
    wrap.appendChild(card);
  });
  wrap.querySelectorAll('.gallery-del').forEach(btn => btn.addEventListener('click', e => {
    pendingRecordPhotos.splice(+e.currentTarget.dataset.i, 1);
    renderPendingPhotos();
  }));
}

document.getElementById('record-add-photo-btn').addEventListener('click', () => {
  document.getElementById('record-file-input').value = '';
  document.getElementById('record-file-input').click();
});
document.getElementById('record-file-input').addEventListener('change', e => {
  const files = Array.from(e.target.files).slice(0, 4 - pendingRecordPhotos.length);
  let done = 0;
  files.forEach(f => {
    const r = new FileReader();
    r.onload = ev => {
      pendingRecordPhotos.push(ev.target.result);
      done++;
      if (done === files.length) renderPendingPhotos();
    };
    r.readAsDataURL(f);
  });
});

// 게시물 올리기
document.getElementById('record-diary-save-btn').addEventListener('click', async () => {
  if (!activeRecordDate) return;
  const text = document.getElementById('record-diary-input').value.trim();
  if (!text && !pendingRecordPhotos.length) return;
  const timeStr = document.getElementById('record-time-input').value || nowTimeStr();

  currentTrip.records[activeRecordDate].posts.push({
    text,
    photos: [...pendingRecordPhotos],
    timeStr,
    ts: Date.now()
  });
  // 시간 순서대로 정렬 (오래된 순)
  currentTrip.records[activeRecordDate].posts.sort((a,b) => (a.timeStr||'').localeCompare(b.timeStr||''));

  document.getElementById('record-diary-input').value = '';
  document.getElementById('record-time-input').value = nowTimeStr();
  pendingRecordPhotos = [];
  renderPendingPhotos();
  renderRecordPosts();
  await saveCurrentTrip();
  showToast('기록이 저장됐어요!');
});

function fmtPostTime(timeStr, ts){
  if (timeStr) {
    const [h,m] = timeStr.split(':').map(Number);
    return `${h<12?'오전':'오후'} ${h===0?12:h>12?h-12:h}:${String(m).padStart(2,'0')}`;
  }
  const d = new Date(ts);
  const h = d.getHours(), m = d.getMinutes();
  return `${h<12?'오전':'오후'} ${h===0?12:h>12?h-12:h}:${String(m).padStart(2,'0')}`;
}

function renderRecordPosts(){
  const listWrap = document.getElementById('record-posts-list');
  listWrap.innerHTML = '';
  const record = currentTrip.records[activeRecordDate];
  const posts = record.posts || [];

  if (!posts.length) {
    listWrap.innerHTML = '<div class="empty-msg">아직 기록이 없어요. 위에서 첫 기록을 남겨보세요.</div>';
    return;
  }

  posts.forEach((post, i) => {
    const row = document.createElement('div');
    row.className = 'record-post';

    let photosHtml = '';
    if (post.photos && post.photos.length) {
      photosHtml = `<div class="record-post-photos n${post.photos.length}">` +
        post.photos.map(src => `<img src="${src}" data-src="${src}">`).join('') +
        `</div>`;
    }

    row.innerHTML = `
      ${photosHtml}
      <div class="record-post-body">
        ${post.text ? `<div class="record-post-text">${esc(post.text)}</div>` : ''}
        <div class="record-post-meta">
          <input type="time" class="record-post-time-inp" value="${esc(post.timeStr||'')}" data-i="${i}">
          <button class="record-post-del" data-i="${i}"><i class="ti ti-trash" style="font-size:13px;"></i></button>
        </div>
      </div>`;
    listWrap.appendChild(row);
  });

  listWrap.querySelectorAll('.record-post-photos img').forEach(img => img.addEventListener('click', () => {
    document.getElementById('lb-img').src = img.dataset.src;
    document.getElementById('lightbox').classList.add('show');
  }));
  listWrap.querySelectorAll('.record-post-time-inp').forEach(inp => inp.addEventListener('change', async e => {
    const i = +e.target.dataset.i;
    posts[i].timeStr = e.target.value;
    posts.sort((a,b) => (a.timeStr||'').localeCompare(b.timeStr||''));
    renderRecordPosts();
    await saveCurrentTrip();
  }));
  listWrap.querySelectorAll('.record-post-del').forEach(btn => btn.addEventListener('click', async e => {
    if (!confirm('이 기록을 삭제할까요?')) return;
    posts.splice(+e.currentTarget.dataset.i, 1);
    renderRecordPosts();
    await saveCurrentTrip();
  }));
}

document.getElementById('lb-close').addEventListener('click', () => document.getElementById('lightbox').classList.remove('show'));
document.getElementById('lightbox').addEventListener('click', e => { if (e.target.id==='lightbox') document.getElementById('lightbox').classList.remove('show'); });

// ===== 시작 =====
GITHUB_OWNER = localStorage.getItem(GH_OWNER_KEY) || '';
GITHUB_REPO = localStorage.getItem(GH_REPO_KEY) || '';
if (getToken() && GITHUB_OWNER && GITHUB_REPO) {
  showMain();
} else {
  document.getElementById('token-screen').style.display = 'flex';
}
