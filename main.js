import { TaxonomyTree, TreeNode } from './src/tree.js'; // Ajuste 1: Importar a classe correta e o TreeNode para checagem de tipo

let search_engine = null;
let search_loading = null;

async function getSearchEngine() {
  // Já carregado
  if (search_engine) {
    return search_engine;
  }

  // Já existe um carregamento em andamento
  if (search_loading) {
    return search_loading;
  }

  search_loading = fetch("/cache/search.dat")
    .then(response => {
      if (!response.ok) {
        throw new Error(
          `Não foi possível carregar search.dat: ${response.status}`
        );
      }

      return response.arrayBuffer();
    })
    .then(buffer => {
      search_engine = new tf_idf(buffer);
      return search_engine;
    })
    .finally(() => {
      search_loading = null;
    });

  return search_loading;
}

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
 * Mapeamento do DOM (Mantido igual)
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

async function init() {
  console.log("init");
  try {
    console.log("try");
    const [treeRes, articlesRes] = await Promise.all([
      fetch('./cache/tree.dat'),
      fetch('./cache/articles.dat')
    ]);

    if (!treeRes.ok || !articlesRes.ok) {
      throw new Error('Falha ao carregar os dados de cache do sistema.');
    }
    console.log("dados de cache carregados");

    const treeBuffer = await treeRes.arrayBuffer();
    const uint8View = new Uint8Array(treeBuffer);
    console.log("treeBuffer carregado");
    const articlesJson = await articlesRes.json();
    console.log("articlesJson carregado");

    console.log("Ajuste 2: Instanciar a classe correta e desserializar");
    state.treeManager = new TaxonomyTree();
    console.log("A API arrayBuffer() retorna ArrayBuffer, o tree.js espera Uint8Array");
    state.treeManager.deserialize(new Uint8Array(uint8View)); 
    
    articlesJson.forEach(art => {
      state.articlesCatalog[art.article_id] = art;
    });

    console.log("renderTaxonomyTree");
    renderTaxonomyTree();
    console.log("renderLuckySection");
    renderLuckySection();
    console.log("bindEvents");
    bindEvents();
    console.log("end of init");

  } catch (err) {
    console.log('Erro na inicialização:', err);
    //DOM.taxonomyTree.innerHTML = `<p class="loading-text">Erro ao carregar o acervo.</p>`;
  }
}

/**
 * Renderiza a árvore de categorias (Sidebar)
 */
function renderTaxonomyTree() {
  DOM.taxonomyTree.innerHTML = '';
  // Ajuste 3: Passar o nó raiz real para a função de build
  const rootUl = buildTreeUI(state.treeManager.root);
  DOM.taxonomyTree.appendChild(rootUl);
}

// Ajuste 4: Refatoração completa para ler a estrutura de children da TreeNode
function buildTreeUI(node) {
  const ul = document.createElement('ul');

  node.children.forEach(child => {
    const li = document.createElement('li');
    li.className = 'tree-node';

    if (child instanceof TreeNode) { // É uma subcategoria
      const titleSpan = document.createElement('span');
      titleSpan.className = 'tree-node-title';
      titleSpan.textContent = `📁 ${child.name}`;
      
      const childUl = buildTreeUI(child);
      childUl.classList.add('hidden'); // Colapsado por padrão

      titleSpan.addEventListener('click', (e) => {
        e.stopPropagation();
        childUl.classList.toggle('hidden');
      });

      li.appendChild(titleSpan);
      li.appendChild(childUl);

    } else if (typeof child === 'string') { // É um artigo (ID)
      const meta = state.articlesCatalog[child] || { title: child };
      
      const a = document.createElement('a');
      a.className = 'article-link';
      a.textContent = `📄 ${meta.title}`;
      a.dataset.id = child;
      
      a.addEventListener('click', (e) => {
        e.preventDefault();
        loadAndRenderArticle(child);
      });

      li.appendChild(a);
    }
    ul.appendChild(li);
  });

  return ul;
}

/**
 * Renderiza a seção "Estou com sorte hoje" usando as raízes da taxonomia
 */
function renderLuckySection() {
  DOM.luckyContainer.innerHTML = '';

  // Ajuste 5: Obter as categorias raízes diretamente de root.children
  const rootCategories = state.treeManager.root.children.filter(c => c instanceof TreeNode);
  
  // Seleciona até 4 categorias raízes de forma aleatória
  const shuffled = [...rootCategories].sort(() => 0.5 - Math.random()).slice(0, 4);

  shuffled.forEach(category => {
    // Busca os artigos dentro da categoria de forma recursiva para mostrar o contador correto
    const articlesIds = state.treeManager.getArticlesInCategory(category, true);
    
    const card = document.createElement('div');
    card.className = 'lucky-card';
    card.innerHTML = `
      <h3>${category.name}</h3>
      <small>${articlesIds.length} artigos</small>
    `;
    card.addEventListener('click', () => {
      showCategoryArticles(category.name, articlesIds); // Passa a lista completa de IDs
    });
    DOM.luckyContainer.appendChild(card);
  });
}

// ... Restante do arquivo main.js (showCategoryArticles, loadAndRenderArticle, bindEvents) permanece inalterado ...

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
  DOM.articleMeta.textContent = `ID: ${articleId}`;
  DOM.articleBody.innerHTML = '';
  DOM.articleStatus.classList.remove('hidden');

  try {
    // 2. Carrega htree.dat e compressor.js sob demanda (Lazy Loading)
    if (!state.htreeData || !state.compressorModule) {
      const [htreeRes, compressorMod] = await Promise.all([
        fetch('./cache/htree.dat'),
        import('./src/ .js')
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

  DOM.searchForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const query = DOM.searchInput.value.trim();

    if (!query) {
      return;
    }

    try {
      const engine = await getSearchEngine();

      const results = engine.search(query, 5);

      renderSearchResults(results, query);
    } catch (error) {
      console.error("Erro na busca:", error);
    }
  });

}

// Inicializa a aplicação
document.addEventListener('DOMContentLoaded', init);