/**
 * Estado da Aplicação
 */
const state = {
  items: [],
  filteredItems: [],
  isLoading: false,
  selectedItem: null,
};

/**
 * Seletores do DOM
 */
const DOM = {
  btnFetchData: document.getElementById('btn-fetch-data'),
  searchInput: document.getElementById('search-input'),
  filterSelect: document.getElementById('filter-select'),
  cardsGrid: document.getElementById('cards-grid'),
  loadingSpinner: document.getElementById('loading-spinner'),
  statusMessage: document.getElementById('status-message'),
  modal: document.getElementById('app-modal'),
  modalTitle: document.getElementById('modal-title'),
  modalBody: document.getElementById('modal-body'),
  btnCloseModal: document.getElementById('btn-close-modal'),
  btnModalCancel: document.getElementById('btn-modal-cancel'),
  btnModalConfirm: document.getElementById('btn-modal-confirm'),
};

/**
 * API Service (Integração com backend/Fase 3)
 */
const API_URL = 'https://jsonplaceholder.typicode.com/posts'; // Endpoint de exemplo

async function fetchItemsFromAPI() {
  setLoading(true);
  hideStatus();

  try {
    const response = await fetch(`${API_URL}?_limit=9`);
    if (!response.ok) throw new Error('Falha ao obter dados da API');

    const data = await response.json();
    
    // Mapeamento/Normalização dos dados recebidos
    state.items = data.map((item) => ({
      id: item.id,
      title: item.title,
      description: item.body,
      status: item.id % 2 === 0 ? 'active' : 'archived',
    }));

    state.filteredItems = [...state.items];
    renderCards(state.filteredItems);
  } catch (error) {
    showStatus(error.message || 'Ocorreu um erro inesperado.', 'error');
  } finally {
    setLoading(false);
  }
}

/**
 * Renderização e Modificadores do DOM
 */
function renderCards(items) {
  DOM.cardsGrid.innerHTML = '';

  if (items.length === 0) {
    DOM.cardsGrid.innerHTML = `
      <div style="grid-column: 1/-1; text-align: center; color: var(--text-muted); padding: 2rem;">
        Nenhum registro encontrado.
      </div>`;
    return;
  }

  items.forEach((item) => {
    const cardEl = document.createElement('article');
    cardEl.className = 'card';
    cardEl.innerHTML = `
      <div>
        <h2 class="card-title">${escapeHTML(item.title)}</h2>
        <p class="card-body">${escapeHTML(item.description)}</p>
      </div>
      <div class="card-footer">
        <button class="btn btn-secondary btn-detail" data-id="${item.id}">Ver detalhes</button>
      </div>
    `;
    DOM.cardsGrid.appendChild(cardEl);
  });
}

function setLoading(isLoading) {
  state.isLoading = isLoading;
  if (isLoading) {
    DOM.loadingSpinner.classList.remove('hidden');
    DOM.cardsGrid.classList.add('hidden');
  } else {
    DOM.loadingSpinner.classList.add('hidden');
    DOM.cardsGrid.classList.remove('hidden');
  }
}

function showStatus(msg, type = 'error') {
  DOM.statusMessage.textContent = msg;
  DOM.statusMessage.className = `alert-box ${type}`;
  DOM.statusMessage.classList.remove('hidden');
}

function hideStatus() {
  DOM.statusMessage.classList.add('hidden');
}

/**
 * Filtros e Busca Local
 */
function applyFilters() {
  const query = DOM.searchInput.value.toLowerCase().trim();
  const filterType = DOM.filterSelect.value;

  state.filteredItems = state.items.filter((item) => {
    const matchesQuery = item.title.toLowerCase().includes(query) || 
                         item.description.toLowerCase().includes(query);
    const matchesFilter = filterType === 'all' || item.status === filterType;

    return matchesQuery && matchesFilter;
  });

  renderCards(state.filteredItems);
}

/**
 * Controle de Modal
 */
function openModal(item) {
  state.selectedItem = item;
  DOM.modalTitle.textContent = item.title;
  DOM.modalBody.innerHTML = `
    <p><strong>ID:</strong> ${item.id}</p>
    <p><strong>Status:</strong> ${item.status}</p>
    <br/>
    <p>${escapeHTML(item.description)}</p>
  `;
  DOM.modal.classList.remove('hidden');
}

function closeModal() {
  DOM.modal.classList.add('hidden');
  state.selectedItem = null;
}

/**
 * Segurança / Sanitização simples
 */
function escapeHTML(str) {
  return str.replace(/[&<>'"]/g, 
    tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
  );
}

/**
 * Event Listeners
 */
function initEvents() {
  DOM.btnFetchData.addEventListener('click', fetchItemsFromAPI);
  
  DOM.searchInput.addEventListener('input', applyFilters);
  DOM.filterSelect.addEventListener('change', applyFilters);

  // Delegação de evento nos cards
  DOM.cardsGrid.addEventListener('click', (e) => {
    const btn = e.target.closest('.btn-detail');
    if (btn) {
      const id = Number(btn.dataset.id);
      const item = state.items.find((i) => i.id === id);
      if (item) openModal(item);
    }
  });

  // Modal events
  DOM.btnCloseModal.addEventListener('click', closeModal);
  DOM.btnModalCancel.addEventListener('click', closeModal);
  DOM.btnModalConfirm.addEventListener('click', () => {
    alert(`Ação confirmada para o item #${state.selectedItem?.id}`);
    closeModal();
  });

  // Fechar modal clicando fora
  DOM.modal.addEventListener('click', (e) => {
    if (e.target === DOM.modal) closeModal();
  });
}

// Inicialização da aplicação
document.addEventListener('DOMContentLoaded', () => {
  initEvents();
});