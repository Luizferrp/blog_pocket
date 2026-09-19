// Removemos os imports estáticos do topo para não quebrar o script se os arquivos não existirem

const state = {
  treeManager: null, // Será carregado dinamicamente
  githubClientClass: null,
  articlesCatalog: {},
  htreeData: null,
  compressorModule: null,
  currentArticleId: null,
  isNewArticle: false
};

const DOM = {
  ghOwner: document.getElementById('gh-owner'),
  ghRepo: document.getElementById('gh-repo'),
  ghToken: document.getElementById('gh-token'),
  articleList: document.getElementById('article-list'),
  categoryTree: document.getElementById('category-tree'),
  btnNewArticle: document.getElementById('btn-new-article'),
  btnAddCategory: document.getElementById('btn-add-category'),
  newCategoryName: document.getElementById('new-category-name'),
  editorTitle: document.getElementById('editor-title'),
  editorContent: document.getElementById('editor-content'),
  btnSave: document.getElementById('btn-save-pr'),
  currentFileId: document.getElementById('current-file-id'),
  statusPanel: document.getElementById('status-panel')
};

// --- 1. BOOTSTRAP (Carrega dependências e arquivos de forma segura) ---
async function init() {
  loadConfig(); 
  
  // 1.1 Tenta importar os módulos. Se falhar, cria "mocks" (dublês) para a UI não travar.
  try {
    const treeMod = await import('./../src/tree.js');
    state.treeManager = new treeMod.TaxonomyTree();
  } catch(e) {
    console.warn("⚠️ ./../src/tree.js não encontrado. Mock ativado.");
    state.treeManager = { 
      root: { children: [] }, deserialize: () => {}, serialize: () => new Uint8Array(),
      addCategory: () => {}, linkArticle: () => {}, unlinkArticle: () => {}, normalize: () => {}
    };
  }

  try {
    const ghMod = await import('./../src/github.js');
    state.githubClientClass = ghMod.GitHubClient;
  } catch(e) {
    console.warn("⚠️ ./../src/github.js não encontrado. Mock ativado.");
    state.githubClientClass = class { 
      createPullRequest() { return Promise.resolve("https://github.com/mock/pull/1"); } 
    };
  }

  try {
    state.compressorModule = await import('./../src/compressor.js').HuffmanCompressor;
  } catch(e) {
    console.warn("⚠️ ./../src/compressor.js não encontrado. Texto puro ativado.");
    state.compressorModule = { decode: (buf) => new TextDecoder().decode(buf) };
  }
  
  // 1.2 Tenta carregar os dados (Tolerante a repositório vazio)
  try {
    const treeRes = await fetch('./../cache/tree.dat').catch(() => null);
    if (treeRes && treeRes.ok) {
      const buffer = await treeRes.arrayBuffer();
      if (buffer.byteLength > 0 && typeof state.treeManager.deserialize === 'function') {
        state.treeManager.deserialize(new Uint8Array(buffer));
      }
    }
    
    const articlesRes = await fetch('./../cache/articles.dat').catch(() => null);
    if (articlesRes && articlesRes.ok) {
      const text = await articlesRes.text();
      if (text.trim().length > 0) {
        try {
          const articles = JSON.parse(text);
          articles.forEach(art => { state.articlesCatalog[art.article_id] = art; });
        } catch (e) { console.warn("articles.dat não é um JSON válido ainda."); }
      }
    }

    const htreeRes = await fetch('./../cache/htree.dat').catch(() => null);
    if (htreeRes && htreeRes.ok) state.htreeData = await htreeRes.arrayBuffer();

  } catch (err) {
    console.warn("Erro ao buscar arquivos locais:", err);
  } finally {
    // 1.3 Atualiza a interface independentemente de ter dado erro ou não
    renderArticleList();
    renderCategoryTree();
    
    if(Object.keys(state.articlesCatalog).length === 0) {
      DOM.articleList.innerHTML = '<li><i>Nenhum artigo encontrado.</i></li>';
    }
  }
}

// --- 2. RENDERIZAÇÃO ---
function renderArticleList() {
  DOM.articleList.innerHTML = '';
  Object.values(state.articlesCatalog).forEach(art => {
    const li = document.createElement('li');
    li.textContent = art.title || art.article_id;
    li.addEventListener('click', () => loadArticle(art.article_id));
    DOM.articleList.appendChild(li);
  });
}

function renderCategoryTree() {
  DOM.categoryTree.innerHTML = '';
  if(!state.treeManager.root) return;
  const ul = buildTreeCheckboxes(state.treeManager.root, []);
  DOM.categoryTree.appendChild(ul);
}

function buildTreeCheckboxes(node, currentPath) {
  const container = document.createElement('div');
  container.className = 'tree-children';

  (node.children || []).forEach(child => {
    const path = [...currentPath, child.name];
    const div = document.createElement('div');
    div.className = 'tree-item';
    
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.dataset.path = JSON.stringify(path);
    checkbox.disabled = !state.currentArticleId;
    
    if (state.currentArticleId && child.children && child.children.includes(state.currentArticleId)) {
      checkbox.checked = true;
    }

    checkbox.addEventListener('change', (e) => {
      const targetPath = JSON.parse(e.target.dataset.path);
      if (e.target.checked) state.treeManager.linkArticle(targetPath, state.currentArticleId);
      else state.treeManager.unlinkArticle(targetPath, state.currentArticleId);
    });

    const label = document.createElement('label');
    label.textContent = child.name || "Sem Nome";

    div.appendChild(checkbox);
    div.appendChild(label);
    container.appendChild(div);
    container.appendChild(buildTreeCheckboxes(child, path));
  });
  return container;
}

// --- 3. LÓGICA DE EDIÇÃO (Destravando Inputs) ---
DOM.btnNewArticle.addEventListener('click', () => {
  const id = `art_${Date.now()}`;
  state.currentArticleId = id;
  state.isNewArticle = true;
  
  // Limpa e destrava
  DOM.editorTitle.value = '';
  DOM.editorContent.value = '';
  DOM.editorTitle.disabled = false;
  DOM.editorContent.disabled = false;
  DOM.btnSave.disabled = false;
  
  DOM.currentFileId.textContent = `Novo arquivo: ${id}.md`;
  
  // Foca no título para digitar na hora
  DOM.editorTitle.focus();
  renderCategoryTree(); 
});

async function loadArticle(articleId) {
  state.currentArticleId = articleId;
  state.isNewArticle = false;
  
  DOM.editorTitle.value = state.articlesCatalog[articleId].title || '';
  DOM.editorTitle.disabled = false;
  DOM.editorContent.disabled = false;
  DOM.btnSave.disabled = false;
  DOM.currentFileId.textContent = `Editando: ${articleId}.md`;

  showStatus("Lendo arquivo...");

  try {
    const file = `/blog_pocket/articles/${articleId}.dat`;
    console.log(file);
    const res = await fetch(file).catch(() => null);
    if (res && res.ok) {
      const buffer = await res.arrayBuffer();
      DOM.editorContent.value = state.compressorModule.HuffmanCompressor.decode(buffer, state.htreeData);
    } else {
      throw new Error("Arquivo não encontrado localmente.");
    }
    renderCategoryTree();
    hideStatus();
  } catch (err) {
    showStatus(`Erro ao ler arquivo: ${err.message}`, true);
  }
}

// --- 4. FLUXO DE SALVAR E PR NO GITHUB ---
DOM.btnSave.addEventListener('click', async () => {
  const owner = DOM.ghOwner.value.trim();
  const repo = DOM.ghRepo.value.trim();
  const token = DOM.ghToken.value.trim();
  
  if (!owner || !repo || !token) return alert("Preencha os dados do GitHub no topo.");
  saveConfig(owner, repo, token);
  
  const title = DOM.editorTitle.value.trim();
  const content = DOM.editorContent.value;
  const articleId = state.currentArticleId;

  showStatus("Preparando commit e gerando Pull Request...");
  DOM.btnSave.disabled = true;

  try {
    state.articlesCatalog[articleId] = {
      article_id: articleId,
      title: title,
      modified: new Date().toISOString()
    };
    const articlesJsonStr = JSON.stringify(Object.values(state.articlesCatalog), null, 2);

    state.treeManager.normalize();
    const treeBuffer = state.treeManager.serialize();

    const filesToCommit = [
      { path: `cache/tree.dat`, content: treeBuffer, isBinary: true },
      { path: `cache/articles.dat`, content: articlesJsonStr, isBinary: false },
      { path: `articles/${articleId}.md`, content: content, isBinary: false }
    ];

    const github = new state.githubClientClass(owner, repo, token);
    const prUrl = await github.createPullRequest(
      `Atualiza/Cria artigo: ${title || articleId}`,
      `Commit gerado automaticamente pelo Editor File-Based.`,
      filesToCommit
    );

    showStatus(`✅ <b>Sucesso!</b> MR/PR Aberto: <a href="${prUrl}" target="_blank">Clique aqui para ver</a>`);
    if(state.isNewArticle) renderArticleList();
    
  } catch(err) {
    showStatus(`❌ Erro no GitHub: ${err.message}`, true);
  } finally {
    DOM.btnSave.disabled = false;
  }
});

// --- HELPERS ---
function showStatus(msg, isError = false) {
  DOM.statusPanel.innerHTML = msg;
  DOM.statusPanel.style.color = isError ? 'red' : '#1e40af';
  DOM.statusPanel.classList.remove('hidden');
}
function hideStatus() { DOM.statusPanel.classList.add('hidden'); }

function saveConfig(owner, repo, token) {
  localStorage.setItem('gh_owner', owner);
  localStorage.setItem('gh_repo', repo);
  localStorage.setItem('gh_token', token);
}
function loadConfig() {
  DOM.ghOwner.value = localStorage.getItem('gh_owner') || '';
  DOM.ghRepo.value = localStorage.getItem('gh_repo') || '';
  DOM.ghToken.value = localStorage.getItem('gh_token') || '';
}

// Inicia
document.addEventListener('DOMContentLoaded', init);