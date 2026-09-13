import { TreeManager } from './src/tree.js';

/**
 * Estado Global em Memória no Runtime
 */
const state = {
  treeManager: null,       // Instância da classe de Taxonomia
  articlesCatalog: {},     // Mapeamento id -> metadata (articles.dat)
  htreeData: null,         // Árvore Huffman compartilhada (carregada sob demanda)
  compressorModule: null,  // Módulo compressor.js (importado sob demanda)
};

/**
 * Mapeamento do DOM
 */
const DOM = {
  taxonomyTree: document.getElementById('taxonomy-tree'),
  luckyContainer: document.getElementById('lucky-container'),
  luckySection: document.getElementById('lucky-section'),
  categoryArticlesSection: document.getElementById('category-articles-section'),
  currentCategoryTitle: document.getElementById('current-category-title'),
  articlesList: document.getElementById('articles-list'),
  articleView: document.getElementById('article-view'),
  articleTitle: document.getElementById('article-title'),
  articleMeta: document.getElementById('article-meta'),
  articleBody: document.getElementById('article-body'),
  articleStatus: document.getElementById('article-status'),
  searchForm: document.getElementById('search-form'),
  searchInput: document.getElementById('search-input'),
  brandLogo: document.getElementById('brand-logo'),
};

/**
 * Inicialização do Runtime (Fase 4)
 */
async function init() {
  try {
    // 1. Carrega tree.dat e articles.dat em paralelo
    const [treeRes, articlesRes] = await Promise.all([
      fetch('/cache/tree.dat'),
      fetch('/cache/articles.dat')
    ]);

    if (!treeRes.ok || !articlesRes.ok) {
      throw new Error('Falha ao carregar os dados de cache do sistema.');
    }

    const treeBuffer = await treeRes.arrayBuffer();
    const articlesJson = await articlesRes.json();

    // 2. Inicializa TreeManager e Catálogo de Artigos
    state.treeManager = new TreeManager();
    state.treeManager.deserialize(treeBuffer);
    
    // Converte o catálogo para busca rápida O(1) por id
    articlesJson.forEach(art => {
      state.articlesCatalog[art.article_id] = art;
    });

    // 3. Monta os componentes da página inicial
    renderTaxonomyTree();
    renderLuckySection();

    // 4. Registrar Eventos
    bindEvents();

  } catch (err) {
    console.error('Erro na inicialização:', err);
    DOM.taxonomyTree.innerHTML = `<p class="loading-text">Erro ao carregar o acervo.</p>`;
  }
}

/**
 * Renderiza a árvore de categorias (Sidebar)
 */
function renderTaxonomyTree() {
  const treeData = state.treeManager.getTreeStructure();
  DOM.taxonomyTree.innerHTML = '';
  
  const rootUl = buildTreeUI(treeData);
  DOM.taxonomyTree.appendChild(rootUl);
}

function buildTreeUI(node) {
  const ul = document.createElement('ul');

  if (node.categories) {
    Object.keys(node.categories).forEach(catName => {
      const li = document.createElement('li');
      li.className = 'tree-node';
      
      const titleSpan = document.createElement('span');
      titleSpan.className = 'tree-node-title';
      titleSpan.textContent = `📁 ${catName}`;
      
      const childUl = buildTreeUI(node.categories[catName]);
      childUl.classList.add('hidden'); // Colapsado por padrão

      titleSpan.addEventListener('click', (e) => {
        e.stopPropagation();
        childUl.classList.toggle('hidden');
      });

      li.appendChild(titleSpan);
      li.appendChild(childUl);
      ul.appendChild(li);
    });
  }

  if (node.articles) {
    node.articles.forEach(articleId => {
      const li = document.createElement('li');
      li.className = 'tree-node';
      
      const meta = state.articlesCatalog[articleId] || { title: articleId };
      
      const a = document.createElement('a');
      a.className = 'article-link';
      a.textContent = `📄 ${meta.title}`;
      a.dataset.id = articleId;
      
      a.addEventListener('click', (e) => {
        e.preventDefault();
        loadAndRenderArticle(articleId);
      });

      li.appendChild(a);
      ul.appendChild(li);
    });
  }

  return ul;
}

/**
 * Renderiza a seção "Estou com sorte hoje" usando as raízes da taxonomia
 */
function renderLuckySection() {
  const roots = state.treeManager.getRootCategories();
  DOM.luckyContainer.innerHTML = '';

  // Seleciona até 4 categorias raízes de forma aleatória
  const shuffled = [...roots].sort(() => 0.5 - Math.random()).slice(0, 4);

  shuffled.forEach(category => {
    const card = document.createElement('div');
    card.className = 'lucky-card';
    card.innerHTML = `
      <h3>${category.name}</h3>
      <small>${category.articleCount || 0} artigos</small>
    `;
    card.addEventListener('click', () => {
      showCategoryArticles(category.name, category.articles);
    });
    DOM.luckyContainer.appendChild(card);
  });
}

/**
 * Exibe a lista de artigos de uma categoria selecionada
 */
function showCategoryArticles(categoryName, articleIds) {
  DOM.luckySection.classList.add('hidden');
  DOM.articleView.classList.add('hidden');
  DOM.categoryArticlesSection.classList.remove('hidden');

  DOM.currentCategoryTitle.textContent = categoryName;
  DOM.articlesList.innerHTML = '';

  articleIds.forEach(id => {
    const meta = state.articlesCatalog[id] || { title: id };
    const li = document.createElement('li');
    li.innerHTML = `<a href="#" class="article-link">${meta.title}</a>`;
    li.querySelector('a').addEventListener('click', (e) => {
      e.preventDefault();
      loadAndRenderArticle(id);
    });
    DOM.articlesList.appendChild(li);
  });
}

/**
 * Carregamento Lazy e Descompressão do Artigo
 */
async function loadAndRenderArticle(articleId) {
  const meta = state.articlesCatalog[articleId] || { title: articleId, created: 'N/A' };

  // 1. Apresenta o Layout do artigo imediatamente com Metadados de articles.dat
  DOM.luckySection.classList.add('hidden');
  DOM.categoryArticlesSection.classList.add('hidden');
  DOM.articleView.classList.remove('hidden');
  
  DOM.articleTitle.textContent = meta.title;
  DOM.articleMeta.textContent = `ID: ${articleId} | Modificado em: ${meta.modified || 'N/A'}`;
  DOM.articleBody.innerHTML = '';
  DOM.articleStatus.classList.remove('hidden');

  try {
    // 2. Carrega htree.dat e compressor.js sob demanda (Lazy Loading)
    if (!state.htreeData || !state.compressorModule) {
      const [htreeRes, compressorMod] = await Promise.all([
        fetch('/cache/htree.dat'),
        import('./src/compressor.js')
      ]);

      if (!htreeRes.ok) throw new Error('Erro ao baixar a árvore de Huffman.');

      state.htreeData = await htreeRes.arrayBuffer();
      state.compressorModule = compressorMod;
    }

    // 3. Baixa o arquivo comprimido .dat do artigo
    const articleRes = await fetch(`/articles/${articleId}.dat`);
    if (!articleRes.ok) throw new Error('Arquivo do artigo não encontrado.');

    const compressedBuffer = await articleRes.arrayBuffer();

    // 4. Descomprime usando o compressor.js e a htree.dat global
    const textContent = state.compressorModule.decode(compressedBuffer, state.htreeData);

    // 5. Renderiza o conteúdo descomprimido
    DOM.articleStatus.classList.add('hidden');
    DOM.articleBody.innerText = textContent;

  } catch (err) {
    console.error(err);
    DOM.articleStatus.classList.add('hidden');
    DOM.articleBody.innerHTML = `<p style="color: red;">Erro ao carregar o conteúdo do artigo.</p>`;
  }
}

/**
 * Event Listeners
 */
function bindEvents() {
  DOM.brandLogo.addEventListener('click', (e) => {
    e.preventDefault();
    DOM.articleView.classList.add('hidden');
    DOM.categoryArticlesSection.classList.add('hidden');
    DOM.luckySection.classList.remove('hidden');
  });

  // Preparação para a Fase 5 (Busca)
  DOM.searchForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const query = DOM.searchInput.value.trim();
    if (!query) return;

    alert(`A busca por "${query}" será acionada na Fase 5 (Carregando matrix.dat + hyper_compressor.js)`);
  });
}

// Inicializa a aplicação
document.addEventListener('DOMContentLoaded', init);