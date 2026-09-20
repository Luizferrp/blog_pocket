import { tf_idf } from "./src/search.js";


// ============================================================
// Estado
// ============================================================

const state = {
  // tree.dat
  tree: null,

  // articles.dat
  articlesCatalog: new Map(),

  // search.dat
  searchEngine: null,
  searchLoading: null,

  // Huffman
  htreeData: null,
  compressorModule: null,

  // navegação
  navigationStack: [],
};


// ============================================================
// DOM
// ============================================================

const DOM = {
  searchForm: document.getElementById("search-form"),
  searchInput: document.getElementById("search-input"),

  searchResultsSection:
    document.getElementById("search-results-section"),

  searchResults:
    document.getElementById("search-results"),

  navigationSection:
    document.getElementById("navigation-section"),

  navigationHeader:
    document.getElementById("navigation-header"),

  cardsGrid:
    document.getElementById("cards-grid"),

  loadingSpinner:
    document.getElementById("loading-spinner"),

  statusMessage:
    document.getElementById("status-message"),
};


// ============================================================
// Inicialização
// ============================================================

async function init() {
  try {
    showLoading(true);

    /*
     * Carregamos apenas:
     *
     * tree.dat
     * articles.dat
     *
     * NÃO carregamos:
     *
     * search.dat
     * htree.dat
     * articles/*.dat
     *
     * ainda.
     */

    const [treeResponse, articlesResponse] =
      await Promise.all([
        fetch("./cache/tree.dat"),
        fetch("./cache/articles.dat"),
      ]);

    if (!treeResponse.ok) {
      throw new Error(
        `Erro ao carregar tree.dat: ${treeResponse.status}`
      );
    }

    if (!articlesResponse.ok) {
      throw new Error(
        `Erro ao carregar articles.dat: ${articlesResponse.status}`
      );
    }

    state.tree = await treeResponse.json();

    const articles = await articlesResponse.json();

    for (const article of articles) {
      state.articlesCatalog.set(
        article.article_id,
        article
      );
    }

    /*
     * Inicialmente mostramos os tópicos raiz.
     */
    renderRootTopics();

    /*
     * Também preparamos os cards de todos os artigos.
     */
    // Você pode chamar showAllArticles() aqui se quiser
    // que eles apareçam junto com os tópicos.
    //
    // showAllArticles();

    bindEvents();

  } catch (error) {
    console.error(error);
    showError(error.message);

  } finally {
    showLoading(false);
  }
}


// ============================================================
// TREE / NAVEGAÇÃO
// ============================================================

function renderRootTopics() {
  state.navigationStack = [];

  hideSearch();

  DOM.navigationHeader.innerHTML = `
    <h2>Tópicos</h2>
  `;

  DOM.cardsGrid.innerHTML = "";

  const rootTopics = Object.entries(state.tree);

  for (const [name, node] of rootTopics) {
    const card = createTopicCard(
      name,
      node,
      true
    );

    DOM.cardsGrid.appendChild(card);
  }
}


/**
 * Renderiza o conteúdo de um tópico.
 *
 * Um tópico pode conter:
 *
 * {
 *   subtopico: {...},
 *   artigos: [...]
 * }
 */
function renderTopic(name, node) {
  hideSearch();

  DOM.cardsGrid.innerHTML = "";

  /*
   * Breadcrumb / botão voltar
   */
  DOM.navigationHeader.innerHTML = "";

  const backButton =
    document.createElement("button");

  backButton.className = "btn btn-secondary";
  backButton.textContent = "← Voltar";

  backButton.addEventListener(
    "click",
    navigateBack
  );

  DOM.navigationHeader.appendChild(
    backButton
  );

  const title =
    document.createElement("h2");

  title.textContent = formatName(name);

  DOM.navigationHeader.appendChild(title);


  /*
   * Primeiro mostramos os SUBTÓPICOS.
   */

  for (const [childName, childNode]
    of Object.entries(node)) {

    if (childName === "artigos") {
      continue;
    }

    const card = createTopicCard(
      childName,
      childNode,
      false
    );

    DOM.cardsGrid.appendChild(card);
  }


  /*
   * Depois mostramos os ARTIGOS diretamente
   * pertencentes a este tópico.
   */

  const articleIds =
    Array.isArray(node.artigos)
      ? node.artigos
      : [];

  for (const articleId of articleIds) {
    const card =
      createArticleCard(articleId);

    DOM.cardsGrid.appendChild(card);
  }
}


function createTopicCard(
  name,
  node,
  isRoot
) {
  const card =
    document.createElement("article");

  card.className = "content-card topic-card";

  const subtopicCount =
    Object.keys(node)
      .filter(key => key !== "artigos")
      .length;

  const articleCount =
    countArticles(node);

  card.innerHTML = `
    <div class="card-icon">📁</div>

    <h3>${escapeHtml(
      formatName(name)
    )}</h3>

    <p>
      ${subtopicCount}
      ${subtopicCount === 1
        ? "subtópico"
        : "subtópicos"}
      ·
      ${articleCount}
      ${articleCount === 1
        ? "artigo"
        : "artigos"}
    </p>
  `;

  card.addEventListener(
    "click",
    () => {
      state.navigationStack.push({
        name,
        node,
      });

      renderTopic(name, node);
    }
  );

  return card;
}


function createArticleCard(articleId) {
  const meta =
    state.articlesCatalog.get(articleId);

  const title =
    meta?.title || articleId;

  const card =
    document.createElement("article");

  card.className =
    "content-card article-card";

  card.innerHTML = `
    <div class="card-icon">📄</div>

    <h3>${escapeHtml(title)}</h3>

    <p>
      ${escapeHtml(articleId)}
    </p>
  `;

  card.addEventListener(
    "click",
    () => {
      loadAndRenderArticle(articleId);
    }
  );

  return card;
}


function navigateBack() {
  state.navigationStack.pop();

  if (state.navigationStack.length === 0) {
    renderRootTopics();
    return;
  }

  const parent =
    state.navigationStack[
      state.navigationStack.length - 1
    ];

  renderTopic(
    parent.name,
    parent.node
  );
}


// ============================================================
// TODOS OS ARTIGOS
// ============================================================

function showAllArticles() {
  hideSearch();

  state.navigationStack = [];

  DOM.navigationHeader.innerHTML = `
    <h2>Todos os artigos</h2>
  `;

  DOM.cardsGrid.innerHTML = "";

  for (const articleId
    of state.articlesCatalog.keys()) {

    DOM.cardsGrid.appendChild(
      createArticleCard(articleId)
    );
  }
}


// ============================================================
// SEARCH
// ============================================================

async function getSearchEngine() {
  /*
   * Já carregado.
   */
  if (state.searchEngine) {
    return state.searchEngine;
  }

  /*
   * Já existe um fetch acontecendo.
   */
  if (state.searchLoading) {
    return state.searchLoading;
  }

  state.searchLoading =
    fetch("./cache/search.dat")
      .then(response => {
        if (!response.ok) {
          throw new Error(
            `Erro ao carregar search.dat: ${response.status}`
          );
        }

        return response.arrayBuffer();
      })
      .then(buffer => {
        state.searchEngine =
          new tf_idf(buffer);

        return state.searchEngine;
      })
      .finally(() => {
        state.searchLoading = null;
      });

  return state.searchLoading;
}


async function executeSearch(query) {
  showLoading(true);

  try {
    const engine =
      await getSearchEngine();

    /*
     * search() retorna:
     *
     * [
     *   { id: "...", score: ... },
     *   ...
     * ]
     */

    const results =
      engine.search(query, 10);

    renderSearchResults(
      results,
      query
    );

  } catch (error) {
    console.error(error);

    showError(
      "Não foi possível realizar a busca."
    );

  } finally {
    showLoading(false);
  }
}


function renderSearchResults(
  results,
  query
) {
  DOM.searchResultsSection.hidden = false;

  DOM.navigationSection.classList.add(
    "hidden"
  );

  DOM.searchResults.innerHTML = "";

  const title =
    document.createElement("h2");

  title.textContent =
    `Resultados para "${query}"`;

  DOM.searchResults.appendChild(title);


  if (!results.length) {
    const empty =
      document.createElement("p");

    empty.textContent =
      "Nenhum artigo encontrado.";

    DOM.searchResults.appendChild(empty);

    return;
  }


  const grid =
    document.createElement("div");

  grid.className = "cards-grid";


  for (const result of results) {
    const card =
      createSearchResultCard(result);

    grid.appendChild(card);
  }

  DOM.searchResults.appendChild(grid);
}


function createSearchResultCard(result) {
  /*
   * IMPORTANTE:
   *
   * O search.dat não precisa conhecer título,
   * filename etc.
   *
   * Ele só retorna article_id.
   *
   * articles.dat resolve o metadata.
   */

  const articleId =
    result.id;

  const meta =
    state.articlesCatalog.get(articleId);

  const title =
    meta?.title || articleId;

  const card =
    document.createElement("article");

  card.className =
    "content-card search-result-card";

  card.innerHTML = `
    <div class="card-icon">🔎</div>

    <h3>${escapeHtml(title)}</h3>

    <p>
      Relevância:
      ${result.score.toFixed(3)}
    </p>
  `;

  card.addEventListener(
    "click",
    () => {
      loadAndRenderArticle(articleId);
    }
  );

  return card;
}


function hideSearch() {
  DOM.searchResultsSection.hidden = true;

  DOM.navigationSection.classList.remove(
    "hidden"
  );
}


// ============================================================
// ARTIGO
// ============================================================

async function loadAndRenderArticle(
  articleId
) {
  /*
   * Por enquanto seu HTML atual não mostrou
   * uma área article-view.
   *
   * Se ela ainda existir no projeto, você pode
   * colocar sua implementação aqui.
   */

  const meta =
    state.articlesCatalog.get(articleId);

  if (!meta) {
    showError(
      `Artigo "${articleId}" não encontrado no catálogo.`
    );

    return;
  }

  try {
    showLoading(true);

    /*
     * Carregamos a árvore Huffman somente
     * quando o primeiro artigo for aberto.
     */
    if (
      !state.htreeData ||
      !state.compressorModule
    ) {
      const [
        htreeResponse,
        compressorModule
      ] = await Promise.all([
        fetch("./cache/htree.dat"),
        import("./src/compressor.js"),
      ]);

      if (!htreeResponse.ok) {
        throw new Error(
          "Não foi possível carregar htree.dat."
        );
      }

      state.htreeData =
        await htreeResponse.arrayBuffer();

      state.compressorModule =
        compressorModule;
    }


    /*
     * Baixa somente o artigo solicitado.
     */
    const response =
      await fetch(
        `./articles/${articleId}.dat`
      );

    if (!response.ok) {
      throw new Error(
        `Artigo não encontrado: ${articleId}`
      );
    }

    const compressedBuffer =
      await response.arrayBuffer();


    /*
     * Descomprime.
     */
    const text =
      state.compressorModule.decode(
        compressedBuffer,
        state.htreeData
      );


    /*
     * Aqui você pode chamar seu sistema atual
     * de visualização do artigo.
     */
    showArticle(
      articleId,
      meta,
      text
    );

  } catch (error) {
    console.error(error);

    showError(
      "Erro ao carregar o artigo."
    );

  } finally {
    showLoading(false);
  }
}


function showArticle(
  articleId,
  meta,
  text
) {
  DOM.navigationSection.classList.add(
    "hidden"
  );

  DOM.searchResultsSection.hidden =
    true;

  /*
   * Como seu HTML atual não possui article-view,
   * por enquanto usamos a própria área de cards.
   *
   * Se você já tem uma tela de artigo em outro
   * HTML, substitua esta parte pelo seu renderer.
   */

  DOM.navigationSection.classList.remove(
    "hidden"
  );

  DOM.navigationHeader.innerHTML = `
    <button id="article-back"
      class="btn btn-secondary">
      ← Voltar
    </button>

    <h2>${escapeHtml(meta.title || articleId)}</h2>
  `;

  DOM.cardsGrid.innerHTML = "";

  const article =
    document.createElement("article");

  article.className =
    "article-content";

  article.innerHTML = `
    <h1>${escapeHtml(meta.title || articleId)}</h1>

    <div class="article-meta">
      ${escapeHtml(articleId)}
    </div>

    <div class="article-body"></div>
  `;

  /*
   * innerText é intencional.
   *
   * Se seus artigos contêm HTML/Markdown,
   * podemos mudar isso posteriormente.
   */
  article
    .querySelector(".article-body")
    .innerText = text;

  DOM.cardsGrid.appendChild(article);


  document
    .getElementById("article-back")
    .addEventListener(
      "click",
      () => {
        renderRootTopics();
      }
    );
}


// ============================================================
// EVENTOS
// ============================================================

function bindEvents() {
  DOM.searchForm.addEventListener(
    "submit",
    async event => {
      event.preventDefault();

      const query =
        DOM.searchInput.value.trim();

      if (!query) {
        hideSearch();
        renderRootTopics();
        return;
      }

      await executeSearch(query);
    }
  );


  /*
   * Opcional: carregar search.dat enquanto o usuário
   * está começando a usar o campo.
   *
   * Isso faz o download acontecer antes do submit.
   */
  DOM.searchInput.addEventListener(
    "focus",
    () => {
      getSearchEngine().catch(error => {
        console.error(
          "Erro pré-carregando search.dat:",
          error
        );
      });
    },
    { once: true }
  );
}


// ============================================================
// UTILITÁRIOS
// ============================================================

function countArticles(node) {
  let count = 0;

  if (Array.isArray(node.artigos)) {
    count += node.artigos.length;
  }

  for (const [key, child] of Object.entries(node)) {
    if (key === "artigos") {
      continue;
    }

    count += countArticles(child);
  }

  return count;
}


function formatName(name) {
  return String(name)
    .replaceAll("_", " ")
    .replace(/\b\w/g, c =>
      c.toUpperCase()
    );
}


function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}


function showLoading(value) {
  if (!DOM.loadingSpinner) {
    return;
  }

  DOM.loadingSpinner.classList.toggle(
    "hidden",
    !value
  );
}


function showError(message) {
  if (!DOM.statusMessage) {
    return;
  }

  DOM.statusMessage.textContent =
    message;

  DOM.statusMessage.classList.remove(
    "hidden"
  );
}


// ============================================================
// START
// ============================================================

document.addEventListener(
  "DOMContentLoaded",
  init
);
