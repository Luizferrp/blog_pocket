/**
 * src/articles_catalog.js
 * Gerenciamento do catálogo de artigos e serialização do /cache/articles.dat
 */

export class ArticleMetadata {
  constructor({
    articleId,
    title,
    created = Date.now(),
    modified = Date.now(),
    size = 0,
    version = 1,
    metadata = {}
  }) {
    this.articleId = articleId;
    this.title = title;
    this.created = BigInt(created);
    this.modified = BigInt(modified);
    this.size = size;
    this.version = version;
    this.metadata = metadata;
  }
}

export class ArticlesCatalog {
  constructor() {
    this.articles = new Map(); // articleId -> ArticleMetadata
  }

  // --- MÉTODOS DE MANIPULAÇÃO (EDITOR / BUILD) ---

  addOrUpdateArticle(metadata) {
    const meta = metadata instanceof ArticleMetadata ? metadata : new ArticleMetadata(metadata);
    this.articles.set(meta.articleId, meta);
  }

  removeArticle(articleId) {
    this.articles.delete(articleId);
  }

  getArticle(articleId) {
    return this.articles.get(articleId) || null;
  }

  getAllArticles() {
    return Array.from(this.articles.values());
  }

  // --- SERIALIZAÇÃO E DESSERIALIZAÇÃO (articles.dat) ---

  serialize() {
    const encoder = new TextEncoder();
    const bytes = [];

    // Escreve total de artigos no cabeçalho (4 bytes uint32)
    const totalCount = this.articles.size;
    bytes.push((totalCount >> 24) & 0xff);
    bytes.push((totalCount >> 16) & 0xff);
    bytes.push((totalCount >> 8) & 0xff);
    bytes.push(totalCount & 0xff);

    for (const meta of this.articles.values()) {
      // 1. article_id
      const idBytes = encoder.encode(meta.articleId);
      bytes.push((idBytes.length >> 8) & 0xff, idBytes.length & 0xff);
      bytes.push(...idBytes);

      // 2. title
      const titleBytes = encoder.encode(meta.title);
      bytes.push((titleBytes.length >> 8) & 0xff, titleBytes.length & 0xff);
      bytes.push(...titleBytes);

      // 3. created (8 bytes BigUint64)
      const createdVal = BigInt(meta.created);
      for (let i = 7; i >= 0; i--) {
        bytes.push(Number((createdVal >> BigInt(i * 8)) & 0xffn));
      }

      // 4. modified (8 bytes BigUint64)
      const modifiedVal = BigInt(meta.modified);
      for (let i = 7; i >= 0; i--) {
        bytes.push(Number((modifiedVal >> BigInt(i * 8)) & 0xffn));
      }

      // 5. size (4 bytes Uint32)
      bytes.push((meta.size >> 24) & 0xff);
      bytes.push((meta.size >> 16) & 0xff);
      bytes.push((meta.size >> 8) & 0xff);
      bytes.push(meta.size & 0xff);

      // 6. version (2 bytes Uint16)
      bytes.push((meta.version >> 8) & 0xff, meta.version & 0xff);

      // 7. metadata JSON
      const jsonBytes = encoder.encode(JSON.stringify(meta.metadata));
      bytes.push((jsonBytes.length >> 8) & 0xff, jsonBytes.length & 0xff);
      bytes.push(...jsonBytes);
    }

    return new Uint8Array(bytes);
  }

  deserialize(uint8Array) {
    const decoder = new TextDecoder();
    this.articles.clear();

    if (uint8Array.length < 4) return;

    let offset = 0;

    // Lê quantidade total de artigos
    const totalCount =
      (uint8Array[offset++] << 24) |
      (uint8Array[offset++] << 16) |
      (uint8Array[offset++] << 8) |
      uint8Array[offset++];

    for (let i = 0; i < totalCount; i++) {
      // 1. article_id
      const idLen = (uint8Array[offset++] << 8) | uint8Array[offset++];
      const articleId = decoder.decode(uint8Array.subarray(offset, offset + idLen));
      offset += idLen;

      // 2. title
      const titleLen = (uint8Array[offset++] << 8) | uint8Array[offset++];
      const title = decoder.decode(uint8Array.subarray(offset, offset + titleLen));
      offset += titleLen;

      // 3. created
      let createdVal = 0n;
      for (let b = 0; b < 8; b++) {
        createdVal = (createdVal << 8n) | BigInt(uint8Array[offset++]);
      }

      // 4. modified
      let modifiedVal = 0n;
      for (let b = 0; b < 8; b++) {
        modifiedVal = (modifiedVal << 8n) | BigInt(uint8Array[offset++]);
      }

      // 5. size
      const size =
        (uint8Array[offset++] << 24) |
        (uint8Array[offset++] << 16) |
        (uint8Array[offset++] << 8) |
        uint8Array[offset++];

      // 6. version
      const version = (uint8Array[offset++] << 8) | uint8Array[offset++];

      // 7. metadata JSON
      const jsonLen = (uint8Array[offset++] << 8) | uint8Array[offset++];
      const jsonStr = decoder.decode(uint8Array.subarray(offset, offset + jsonLen));
      offset += jsonLen;
      const metadata = JSON.parse(jsonStr || "{}");

      this.addOrUpdateArticle(
        new ArticleMetadata({
          articleId,
          title,
          created: Number(createdVal),
          modified: Number(modifiedVal),
          size,
          version,
          metadata
        })
      );
    }
  }
}