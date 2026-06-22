// ===== GitHub 설정 =====
const TOKEN_KEY = 'diary_github_token';
const GH_OWNER_KEY = 'wishlist_gh_owner';
const GH_REPO_KEY = 'wishlist_gh_repo';
const GITHUB_BRANCH = 'main';

let GITHUB_OWNER = '';
let GITHUB_REPO = '';

function getToken(){ return localStorage.getItem(TOKEN_KEY) || ''; }

// ===== 카테고리 정의 =====
const CATEGORIES = {
  book:    { label: '책',        fields: ['author','tag'] },
  movie:   { label: '영화/드라마', fields: [] },
  comic:   { label: '만화',      fields: [] },
  novel:   { label: '장르소설',  fields: ['author'] },
  webtoon: { label: '웹툰',      fields: ['author'] },
  game:    { label: '게임',      fields: ['price'] }
};

let activeCategory = 'book';
let items = {}; // { book: [...], movie: [...], ... }
let itemsSha = null;
let editingId = null; // 수정 중인 아이템 id (없으면 신규)
let pendingImage = null;

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
  const body = { message: `wishlist: ${path}`, content: btoa(unescape(encodeURIComponent(JSON.stringify(content, null, 2)))), branch: GITHUB_BRANCH };
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
  loadItems();
}

// ===== 데이터 로드/저장 =====
async function loadItems(){
  setSyncStatus('saving','불러오는 중...');
  try {
    const file = await ghGet('wishlist/items.json');
    if (file) { itemsSha = file.sha; items = decodeContent(file); }
    else { itemsSha = null; items = {}; }
    Object.keys(CATEGORIES).forEach(cat => { if (!items[cat]) items[cat] = []; });
    setSyncStatus('ok','동기화됨');
  } catch(e) { setSyncStatus('error','불러오기 실패'); items = {}; Object.keys(CATEGORIES).forEach(cat => items[cat] = []); }
  renderItems();
}
async function saveItems(){
  setSyncStatus('saving','저장 중...');
  try {
    const res = await ghPut('wishlist/items.json', items, itemsSha);
    itemsSha = res.content.sha;
    setSyncStatus('ok','저장 완료 ✓');
  } catch(e) { setSyncStatus('error','저장 실패'); }
}

// ===== 탭 전환 =====
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    activeCategory = btn.dataset.cat;
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b===btn));
    renderItems();
  });
});

// ===== 렌더링 =====
function renderItems(){
  const grid = document.getElementById('item-grid');
  const empty = document.getElementById('empty-msg');
  grid.innerHTML = '';
  const list = items[activeCategory] || [];

  if (!list.length) { empty.style.display=''; return; }
  empty.style.display='none';

  list.forEach(item => {
    const card = document.createElement('div');
    card.className = 'item-card';

    let tagsHtml = '';
    if (item.tag) {
      const tags = item.tag.split(',').map(t=>t.trim()).filter(Boolean);
      if (tags.length) tagsHtml = `<div class="item-card-tags">${tags.map(t=>`<span class="item-tag-chip">${esc(t)}</span>`).join('')}</div>`;
    }

    card.innerHTML = `
      <div class="item-card-actions">
        <button class="item-card-btn" data-action="edit" data-id="${item.id}"><i class="ti ti-pencil"></i></button>
        <button class="item-card-btn" data-action="delete" data-id="${item.id}"><i class="ti ti-trash"></i></button>
      </div>
      <div class="item-card-img">${item.image ? `<img src="${item.image}" data-src="${item.image}">` : '<i class="ti ti-photo" style="font-size:28px;"></i>'}</div>
      <div class="item-card-body">
        <div class="item-card-title">${esc(item.title||'(제목 없음)')}</div>
        ${item.author ? `<div class="item-card-author">${esc(item.author)}</div>` : ''}
        ${item.price ? `<div class="item-card-price">${Number(item.price).toLocaleString()}원</div>` : ''}
        ${tagsHtml}
      </div>`;
    grid.appendChild(card);
  });

  grid.querySelectorAll('.item-card-img img').forEach(img => img.addEventListener('click', () => {
    document.getElementById('lb-img').src = img.dataset.src;
    document.getElementById('lightbox').classList.add('show');
  }));
  grid.querySelectorAll('[data-action="edit"]').forEach(btn => btn.addEventListener('click', () => openModal(btn.dataset.id)));
  grid.querySelectorAll('[data-action="delete"]').forEach(btn => btn.addEventListener('click', async () => {
    if (!confirm('이 항목을 삭제할까요?')) return;
    items[activeCategory] = items[activeCategory].filter(it => it.id !== btn.dataset.id);
    renderItems();
    await saveItems();
  }));
}

document.getElementById('lb-close').addEventListener('click', () => document.getElementById('lightbox').classList.remove('show'));
document.getElementById('lightbox').addEventListener('click', e => { if (e.target.id==='lightbox') document.getElementById('lightbox').classList.remove('show'); });

// ===== 모달 (추가/수정) =====
document.getElementById('add-item-btn').addEventListener('click', () => openModal(null));

function openModal(id){
  editingId = id;
  pendingImage = null;
  const fields = CATEGORIES[activeCategory].fields;

  document.getElementById('modal-title').textContent = id ? `${CATEGORIES[activeCategory].label} 수정` : `${CATEGORIES[activeCategory].label} 추가`;
  document.getElementById('f-author-row').style.display = fields.includes('author') ? '' : 'none';
  document.getElementById('f-tag-row').style.display = fields.includes('tag') ? '' : 'none';
  document.getElementById('f-price-row').style.display = fields.includes('price') ? '' : 'none';

  if (id) {
    const item = items[activeCategory].find(it => it.id === id);
    document.getElementById('f-title').value = item.title || '';
    document.getElementById('f-author').value = item.author || '';
    document.getElementById('f-tag').value = item.tag || '';
    document.getElementById('f-price').value = item.price || '';
    document.getElementById('f-desc').value = item.desc || '';
    pendingImage = item.image || null;
    updateImgPreview();
  } else {
    document.getElementById('f-title').value = '';
    document.getElementById('f-author').value = '';
    document.getElementById('f-tag').value = '';
    document.getElementById('f-price').value = '';
    document.getElementById('f-desc').value = '';
    updateImgPreview();
  }

  document.getElementById('modal-overlay').classList.add('show');
}

function updateImgPreview(){
  const preview = document.getElementById('img-preview');
  preview.innerHTML = pendingImage ? `<img src="${pendingImage}">` : '<i class="ti ti-photo"></i>';
}

document.getElementById('img-upload-btn').addEventListener('click', () => document.getElementById('img-file-input').click());
document.getElementById('img-file-input').addEventListener('change', e => {
  const file = e.target.files[0];
  if (!file) return;
  const r = new FileReader();
  r.onload = ev => { pendingImage = ev.target.result; updateImgPreview(); };
  r.readAsDataURL(file);
});

document.getElementById('modal-cancel').addEventListener('click', () => document.getElementById('modal-overlay').classList.remove('show'));

document.getElementById('modal-confirm').addEventListener('click', async () => {
  const title = document.getElementById('f-title').value.trim();
  if (!title) { alert('제목을 입력해주세요.'); return; }

  const data = {
    id: editingId || uid(),
    title,
    author: document.getElementById('f-author').value.trim(),
    tag: document.getElementById('f-tag').value.trim(),
    price: document.getElementById('f-price').value,
    desc: document.getElementById('f-desc').value.trim(),
    image: pendingImage
  };

  if (editingId) {
    const idx = items[activeCategory].findIndex(it => it.id === editingId);
    if (idx > -1) items[activeCategory][idx] = data;
  } else {
    items[activeCategory].push(data);
  }

  document.getElementById('modal-overlay').classList.remove('show');
  renderItems();
  await saveItems();
  showToast('저장됐어요!');
});

// ===== 시작 =====
GITHUB_OWNER = localStorage.getItem(GH_OWNER_KEY) || '';
GITHUB_REPO = localStorage.getItem(GH_REPO_KEY) || '';
if (getToken() && GITHUB_OWNER && GITHUB_REPO) {
  showMain();
} else {
  document.getElementById('token-screen').style.display = 'flex';
}
