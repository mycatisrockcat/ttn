// ===== GitHub 설정 =====
const TOKEN_KEY = 'diary_github_token';
const GH_OWNER_KEY = 'reading_gh_owner';
const GH_REPO_KEY = 'reading_gh_repo';
const GITHUB_BRANCH = 'main';

let GITHUB_OWNER = '';
let GITHUB_REPO = '';

function getToken(){ return localStorage.getItem(TOKEN_KEY) || ''; }

const STATUS_LIST = ['읽는 중', '읽다 맘', '읽음', '발췌독'];
const STATUS_COLOR = { '읽는 중':'#1d9bf0', '읽다 맘':'#8b98a5', '읽음':'#00ba7c', '발췌독':'#ffb800' };

let books = []; // [{id, title, author, status, genre, rating, cover, start, end, medium, toc:[{id,name,text}]}]
let booksSha = null;
let currentBook = null;
let activeFilter = null; // 상태 필터
let lastAddedPartId = null;

// ===== 유틸 =====
function esc(s){ return (s||'').toString().replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function uid(){ return Date.now().toString(36)+Math.random().toString(36).slice(2,7); }
function showToast(msg){ const t=document.getElementById('toast'); t.textContent=msg; t.classList.add('show'); setTimeout(()=>t.classList.remove('show'),2200); }
function setSyncStatus(state,msg){ document.getElementById('sync-dot').className='sync-dot '+state; document.getElementById('sync-msg').textContent=msg; }

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
  const body = { message: `reading: ${path}`, content: btoa(unescape(encodeURIComponent(JSON.stringify(content, null, 2)))), branch: GITHUB_BRANCH };
  if (sha) body.sha = sha;
  const res = await fetch(`https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${path}`, {
    method: 'PUT',
    headers: { Authorization: `token ${getToken()}`, Accept: 'application/vnd.github.v3+json', 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error('저장 실패');
  return res.json();
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

document.getElementById('reset-btn').addEventListener('click', () => {
  const ownerNow = localStorage.getItem(GH_OWNER_KEY) || '(없음)';
  const repoNow = localStorage.getItem(GH_REPO_KEY) || '(없음)';
  const ok = confirm(`현재 설정\n사용자명: ${ownerNow}\n저장소: ${repoNow}\n\n설정을 초기화하고 다시 입력할까요?`);
  if (!ok) return;
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(GH_OWNER_KEY);
  localStorage.removeItem(GH_REPO_KEY);
  location.reload();
});

function showMain(){
  document.getElementById('token-screen').style.display='none';
  document.getElementById('main-screen').style.display='block';
  loadBooks();
}

// ===== 데이터 로드/저장 =====
async function loadBooks(){
  setSyncStatus('saving','불러오는 중...');
  try {
    const file = await ghGet('reading/books.json');
    if (file) { booksSha = file.sha; books = decodeContent(file); }
    else { booksSha = null; books = []; }
    books.forEach(b => { if (!b.toc) b.toc = []; });
    setSyncStatus('ok','동기화됨');
  } catch(e) { setSyncStatus('error','불러오기 실패'); books = []; }
  renderFilterBar();
  renderBookList();
  showListScreen();
}
async function saveBooks(){
  setSyncStatus('saving','저장 중...');
  try {
    const res = await ghPut('reading/books.json', books, booksSha);
    booksSha = res.content.sha;
    setSyncStatus('ok','저장 완료 ✓');
  } catch(e) { setSyncStatus('error','저장 실패'); }
}

// ===== 화면 전환 =====
function showListScreen(){
  document.getElementById('list-screen').style.display='block';
  document.getElementById('detail-screen').style.display='none';
}
function showDetailScreen(){
  document.getElementById('list-screen').style.display='none';
  document.getElementById('detail-screen').style.display='block';
}
document.getElementById('back-btn').addEventListener('click', showListScreen);

// ===== 필터 =====
function renderFilterBar(){
  const bar = document.getElementById('filter-bar');
  bar.innerHTML = '';
  const allChip = document.createElement('button');
  allChip.className = 'filter-chip' + (activeFilter===null?' active':'');
  allChip.textContent = '전체';
  allChip.addEventListener('click', () => { activeFilter=null; renderFilterBar(); renderBookList(); });
  bar.appendChild(allChip);
  STATUS_LIST.forEach(st => {
    const chip = document.createElement('button');
    chip.className = 'filter-chip' + (activeFilter===st?' active':'');
    chip.textContent = st;
    chip.addEventListener('click', () => { activeFilter = (activeFilter===st?null:st); renderFilterBar(); renderBookList(); });
    bar.appendChild(chip);
  });
}

// ===== 목록 렌더링 =====
function renderBookList(){
  const grid = document.getElementById('book-grid');
  const empty = document.getElementById('empty-msg');
  grid.innerHTML = '';
  let list = books;
  if (activeFilter) list = list.filter(b => b.status === activeFilter);

  if (!list.length) { empty.style.display=''; return; }
  empty.style.display='none';

  list.forEach(book => {
    const card = document.createElement('div');
    card.className = 'book-card';
    const stars = book.rating ? '★'.repeat(book.rating) + '☆'.repeat(5-book.rating) : '';
    card.innerHTML = `
      <button class="book-delete-btn" data-id="${book.id}"><i class="ti ti-trash"></i></button>
      <div class="book-cover">${book.cover ? `<img src="${book.cover}">` : '<i class="ti ti-book" style="font-size:28px;"></i>'}</div>
      <div class="book-card-body">
        <div class="book-title">${esc(book.title||'(제목 없음)')}</div>
        ${book.author ? `<div class="book-author">${esc(book.author)}</div>` : ''}
        <div class="book-meta-row">
          <span class="book-status-badge" style="background:${STATUS_COLOR[book.status]||'#8b98a5'};">${esc(book.status||'')}</span>
          ${stars ? `<span class="book-stars">${stars}</span>` : ''}
        </div>
      </div>`;
    card.addEventListener('click', e => {
      if (e.target.closest('.book-delete-btn')) return;
      openBook(book.id);
    });
    grid.appendChild(card);
  });

  grid.querySelectorAll('.book-delete-btn').forEach(btn => btn.addEventListener('click', async e => {
    e.stopPropagation();
    if (!confirm('이 책을 삭제할까요?')) return;
    books = books.filter(b => b.id !== btn.dataset.id);
    renderBookList();
    await saveBooks();
  }));
}

// ===== 새 책 추가 =====
document.getElementById('add-book-btn').addEventListener('click', async () => {
  const newBook = {
    id: uid(), title: '새 책', author: '', status: '읽는 중', genre: '기타',
    rating: 0, cover: null, start: '', end: '', medium: '종이책', toc: []
  };
  books.unshift(newBook);
  await saveBooks();
  renderBookList();
  openBook(newBook.id);
});

// ===== 책 상세 열기 =====
function openBook(id){
  currentBook = books.find(b => b.id === id);
  if (!currentBook) return;
  lastAddedPartId = null;

  document.getElementById('detail-title').textContent = currentBook.title || '책';
  document.getElementById('f-title').value = currentBook.title || '';
  document.getElementById('f-author').value = currentBook.author || '';
  document.getElementById('f-status').value = currentBook.status || '읽는 중';
  document.getElementById('f-medium').value = currentBook.medium || '종이책';
  document.getElementById('f-genre').value = currentBook.genre || '기타';
  document.getElementById('f-start').value = currentBook.start || '';
  document.getElementById('f-end').value = currentBook.end || '';
  renderCover();
  renderStars(currentBook.rating || 0);
  renderTocNav();
  renderTocContent();
  showDetailScreen();
}

function renderCover(){
  const el = document.getElementById('book-info-cover');
  el.innerHTML = currentBook.cover
    ? `<img src="${currentBook.cover}"><div class="cover-overlay">표지 변경</div>`
    : `<i class="ti ti-book" style="font-size:32px;"></i><div class="cover-overlay">표지 변경</div>`;
}
document.getElementById('book-info-cover').addEventListener('click', () => document.getElementById('cover-file-input').click());
document.getElementById('cover-file-input').addEventListener('change', e => {
  const file = e.target.files[0];
  if (!file) return;
  const r = new FileReader();
  r.onload = ev => { currentBook.cover = ev.target.result; renderCover(); };
  r.readAsDataURL(file);
});

// ===== 별점 =====
function renderStars(rating){
  document.querySelectorAll('#star-picker i').forEach(star => {
    star.classList.toggle('filled', +star.dataset.v <= rating);
  });
}
document.querySelectorAll('#star-picker i').forEach(star => {
  star.addEventListener('click', () => {
    const v = +star.dataset.v;
    currentBook.rating = (currentBook.rating === v) ? 0 : v; // 같은 별 다시 누르면 초기화
    renderStars(currentBook.rating);
  });
});

// ===== 정보 저장 =====
document.getElementById('save-info-btn').addEventListener('click', async () => {
  currentBook.title = document.getElementById('f-title').value.trim() || '(제목 없음)';
  currentBook.author = document.getElementById('f-author').value.trim();
  currentBook.status = document.getElementById('f-status').value;
  currentBook.medium = document.getElementById('f-medium').value;
  currentBook.genre = document.getElementById('f-genre').value;
  currentBook.start = document.getElementById('f-start').value;
  currentBook.end = document.getElementById('f-end').value;
  document.getElementById('detail-title').textContent = currentBook.title;
  await saveBooks();
  renderBookList();
  showToast('저장됐어요!');
});

// ===== 목차 (계층 구조: 부 > 장) =====

function renderTocNav(){
  const wrap = document.getElementById('toc-nav-list');
  wrap.innerHTML = '';
  currentBook.toc.forEach(item => {
    const row = document.createElement('div');
    row.className = 'toc-nav-item';
    const cls = item.level === 'part' ? 'is-part' : 'is-chapter';
    row.innerHTML = `
      <button class="toc-nav-btn ${cls}" data-id="${item.id}">${esc(item.name)}</button>
      <button class="toc-nav-del" data-id="${item.id}"><i class="ti ti-x"></i></button>`;
    wrap.appendChild(row);
  });

  wrap.querySelectorAll('.toc-nav-btn').forEach(btn => btn.addEventListener('click', () => {
    const target = document.getElementById('toc-sec-'+btn.dataset.id);
    if (target) target.scrollIntoView({ behavior:'smooth', block:'start' });
  }));
  wrap.querySelectorAll('.toc-nav-del').forEach(btn => btn.addEventListener('click', async e => {
    e.stopPropagation();
    const id = btn.dataset.id;
    const item = currentBook.toc.find(t => t.id === id);
    let toDelete = [id];
    if (item.level === 'part') {
      // 그 목차 아래의 하위 목차들도 같이 삭제
      currentBook.toc.forEach(t => { if (t.parentId === id) toDelete.push(t.id); });
      if (!confirm(`"${item.name}"과 그 안의 하위 목차들도 모두 삭제할까요?`)) return;
    } else {
      if (!confirm('이 하위 목차를 삭제할까요?')) return;
    }
    currentBook.toc = currentBook.toc.filter(t => !toDelete.includes(t.id));
    renderTocNav();
    renderTocContent();
    await saveBooks();
  }));
}

document.getElementById('add-part-btn').addEventListener('click', async () => {
  const input = document.getElementById('new-part-input');
  const name = input.value.trim();
  if (!name) return;
  const newItem = { id: uid(), name, level: 'part', parentId: null, text: '' };
  currentBook.toc.push(newItem);
  lastAddedPartId = newItem.id;
  input.value = '';
  renderTocNav();
  renderTocContent();
  await saveBooks();
});
document.getElementById('new-part-input').addEventListener('keydown', e => { if (e.key==='Enter') document.getElementById('add-part-btn').click(); });

document.getElementById('add-chapter-btn').addEventListener('click', async () => {
  const input = document.getElementById('new-chapter-input');
  const name = input.value.trim();
  if (!name) return;
  if (!lastAddedPartId || !currentBook.toc.find(t => t.id === lastAddedPartId)) {
    alert('먼저 "목차"를 추가하거나, 추가할 목차를 선택해주세요. (가장 최근에 추가/클릭한 목차 아래에 하위 목차가 들어가요)');
    return;
  }
  const newItem = { id: uid(), name, level: 'chapter', parentId: lastAddedPartId, text: '' };
  // 같은 목차에 속한 하위 목차들 바로 뒤에 삽입
  let insertAt = currentBook.toc.length;
  for (let i = currentBook.toc.length - 1; i >= 0; i--) {
    const t = currentBook.toc[i];
    if (t.id === lastAddedPartId || t.parentId === lastAddedPartId) { insertAt = i + 1; break; }
  }
  currentBook.toc.splice(insertAt, 0, newItem);
  input.value = '';
  renderTocNav();
  renderTocContent();
  await saveBooks();
});
document.getElementById('new-chapter-input').addEventListener('keydown', e => { if (e.key==='Enter') document.getElementById('add-chapter-btn').click(); });

// 바로가기 목록에서 목차를 클릭하면 그 목차를 하위 목차 추가 대상으로도 지정
document.getElementById('toc-nav-list').addEventListener('click', e => {
  const btn = e.target.closest('.toc-nav-btn.is-part');
  if (btn) lastAddedPartId = btn.dataset.id;
});

function renderTocContent(){
  const content = document.getElementById('toc-content');
  content.innerHTML = '';
  if (!currentBook.toc.length) {
    content.innerHTML = '<div class="toc-empty">목차를 추가하면<br>여기에 전체 내용이 순서대로 나와요.</div>';
    return;
  }

  currentBook.toc.forEach(item => {
    const isChapter = item.level === 'chapter';
    const section = document.createElement('div');
    section.className = 'toc-section' + (isChapter ? ' is-chapter' : '');
    section.id = 'toc-sec-' + item.id;
    section.innerHTML = `
      <div class="toc-section-title ${isChapter ? 'is-chapter' : 'is-part'}">${esc(item.name)}</div>
      <textarea class="toc-section-textarea" data-id="${item.id}" placeholder="발췌, 감상, 메모를 자유롭게 적어보세요.">${esc(item.text||'')}</textarea>
      <div class="toc-save-row ${isChapter ? 'is-chapter' : ''}">
        <button class="toc-save-btn" data-id="${item.id}">저장</button>
      </div>`;
    content.appendChild(section);
  });

  content.querySelectorAll('.toc-save-btn').forEach(btn => btn.addEventListener('click', async () => {
    const id = btn.dataset.id;
    const item = currentBook.toc.find(t => t.id === id);
    const textarea = content.querySelector(`.toc-section-textarea[data-id="${id}"]`);
    item.text = textarea.value;
    await saveBooks();
    showToast('저장됐어요!');
  }));
}

// ===== 시작 =====
GITHUB_OWNER = localStorage.getItem(GH_OWNER_KEY) || '';
GITHUB_REPO = localStorage.getItem(GH_REPO_KEY) || '';
if (getToken() && GITHUB_OWNER && GITHUB_REPO) {
  showMain();
} else {
  document.getElementById('token-screen').style.display = 'flex';
}
