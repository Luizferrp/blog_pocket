/**
 * src/tree.js
 * Gerenciamento de Taxonomia N:N e Serialização do tree.dat
 */

export class TreeNode {
  constructor(name = "root", isCategory = true) {
    this.name = name;
    this.isCategory = isCategory;
    this.children = []; // Podem ser subcategorias (TreeNode) ou artigos (string ID)
  }
}

export class TaxonomyTree {
  constructor() {
    this.root = new TreeNode("root", true);
  }

  // --- CONSULTAS EM RUNTIME (SITE PÚBLICO) ---

  /**
   * Busca uma categoria pelo caminho hierárquico (ex: ["Comida", "Asiática"])
   */
  findCategory(pathArray) {
    let current = this.root;
    for (const seg of pathArray) {
      const found = current.children.find(c => c instanceof TreeNode && c.name === seg);
      if (!found) return null;
      current = found;
    }
    return current;
  }

  /**
   * Retorna todos os artigos diretamente em uma categoria ou subcategorias
   */
  getArticlesInCategory(categoryNode, recursive = false) {
    const articles = new Set();
    const traverse = (node) => {
      for (const child of node.children) {
        if (typeof child === "string") {
          articles.add(child);
        } else if (recursive && child instanceof TreeNode) {
          traverse(child);
        }
      }
    };
    traverse(categoryNode);
    return Array.from(articles);
  }

  // --- OPERAÇÕES DA TAXONOMIA (EDITOR) ---

  addCategory(parentPath, categoryName) {
    const parent = parentPath.length === 0 ? this.root : this.findCategory(parentPath);
    if (!parent) throw new Error("Categoria pai não encontrada");

    let existing = parent.children.find(c => c instanceof TreeNode && c.name === categoryName);
    if (!existing) {
      existing = new TreeNode(categoryName, true);
      parent.children.push(existing);
    }
    return existing;
  }

  linkArticle(categoryPath, articleId) {
    const category = this.findCategory(categoryPath);
    if (!category) throw new Error("Categoria não encontrada para vincular artigo");
    if (!category.children.includes(articleId)) {
      category.children.push(articleId);
    }
  }

  unlinkArticle(categoryPath, articleId) {
    const category = this.findCategory(categoryPath);
    if (!category) return;
    category.children = category.children.filter(child => child !== articleId);
  }

  /**
   * Regra 7.3: Normalização/Achatamento da Árvore
   * Achata categorias simples em nomes compostos (ex: Oceania -> Austrália vira Oceania_Austrália)
   */
  normalize() {
    const flattenNode = (node) => {
      for (let i = 0; i < node.children.length; i++) {
        const child = node.children[i];
        if (child instanceof TreeNode) {
          flattenNode(child);

          // Se a subcategoria contém apenas 1 subcategoria e nenhum artigo
          const subCategories = child.children.filter(c => c instanceof TreeNode);
          const articles = child.children.filter(c => typeof c === "string");

          if (subCategories.length === 1 && articles.length === 0) {
            const singleChild = subCategories[0];
            child.name = `${child.name}_${singleChild.name}`;
            child.children = singleChild.children;
          }
        }
      }
    };
    flattenNode(this.root);
  }

  // --- SERIALIZAÇÃO / DESSERIALIZAÇÃO (tree.dat) ---

  serialize() {
    const encoder = new TextEncoder();
    const bytes = [];

    const traverse = (node) => {
      for (const child of node.children) {
        if (child instanceof TreeNode) {
          bytes.push(0x01); // Marcador Início Categoria
          const nameBytes = encoder.encode(child.name);
          bytes.push(nameBytes.length);
          bytes.push(...nameBytes);
          
          traverse(child);
          
          bytes.push(0x02); // Marcador Fim Categoria
        } else if (typeof child === "string") {
          bytes.push(0x03); // Marcador Artigo
          const idBytes = encoder.encode(child);
          bytes.push(idBytes.length);
          bytes.push(...idBytes);
        }
      }
    };

    traverse(this.root);
    return new Uint8Array(bytes);
  }

  deserialize(uint8Array) {
    const decoder = new TextDecoder();
    this.root = new TreeNode("root", true);
    
    const stack = [this.root];
    let offset = 0;

    while (offset < uint8Array.length) {
      const tag = uint8Array[offset++];
      
      if (tag === 0x01) { // Nova Categoria
        const len = uint8Array[offset++];
        const name = decoder.decode(uint8Array.subarray(offset, offset + len));
        offset += len;

        const newNode = new TreeNode(name, true);
        stack[stack.length - 1].children.push(newNode);
        stack.push(newNode);

      } else if (tag === 0x02) { // Fim Categoria
        stack.pop();

      } else if (tag === 0x03) { // Artigo
        const len = uint8Array[offset++];
        const articleId = decoder.decode(uint8Array.subarray(offset, offset + len));
        offset += len;

        stack[stack.length - 1].children.push(articleId);
      }
    }
  }
}