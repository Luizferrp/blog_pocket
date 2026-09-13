/**
 * src/github.js
 * Cliente direto para a GitHub API, criando PRs sem backend.
 */

export class GitHubClient {
  constructor(owner, repo, token) {
    this.owner = owner;
    this.repo = repo;
    this.token = token;
    this.baseUrl = `https://api.github.com/repos/${owner}/${repo}`;
  }

  async request(endpoint, options = {}) {
    const res = await fetch(`${this.baseUrl}${endpoint}`, {
      ...options,
      headers: {
        'Authorization': `Bearer ${this.token}`,
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
        ...options.headers
      }
    });
    if (!res.ok) {
      const error = await res.json();
      throw new Error(`GitHub API Error (${res.status}): ${error.message}`);
    }
    return res.json();
  }

  // Converte Uint8Array (do tree.dat) para Base64
  bufferToBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  /**
   * Fluxo mestre: Cria Branch -> Blobs -> Tree -> Commit -> Atualiza Ref -> PR
   * files: array de { path: string, content: string|Uint8Array, isBinary: boolean }
   */
  async createPullRequest(title, body, files) {
    // 1. Gera o nome da branch (AAAA_DD_MM_HH_M_SS)
    const now = new Date();
    const branchName = `edit_${now.getFullYear()}_${String(now.getDate()).padStart(2, '0')}_${String(now.getMonth() + 1).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}_${String(now.getMinutes()).padStart(2, '0')}_${String(now.getSeconds()).padStart(2, '0')}`;

    console.log(`[1/6] Buscando último commit da main...`);
    const { object: { sha: mainSha } } = await this.request('/git/ref/heads/main');
    const mainCommit = await this.request(`/git/commits/${mainSha}`);
    const baseTreeSha = mainCommit.tree.sha;

    console.log(`[2/6] Criando Blobs (Arquivos)...`);
    const treeItems = await Promise.all(files.map(async (file) => {
      const contentBase64 = file.isBinary 
        ? this.bufferToBase64(file.content)
        : btoa(unescape(encodeURIComponent(file.content))); // Base64 seguro para UTF-8 puro
      
      const blob = await this.request('/git/blobs', {
        method: 'POST',
        body: JSON.stringify({ content: contentBase64, encoding: 'base64' })
      });

      return {
        path: file.path,
        mode: '100644',
        type: 'blob',
        sha: blob.sha
      };
    }));

    console.log(`[3/6] Criando a nova Tree...`);
    const newTree = await this.request('/git/trees', {
      method: 'POST',
      body: JSON.stringify({ base_tree: baseTreeSha, tree: treeItems })
    });

    console.log(`[4/6] Efetuando o Commit...`);
    const newCommit = await this.request('/git/commits', {
      method: 'POST',
      body: JSON.stringify({
        message: title,
        tree: newTree.sha,
        parents: [mainSha]
      })
    });

    console.log(`[5/6] Criando a Branch: ${branchName}...`);
    await this.request('/git/refs', {
      method: 'POST',
      body: JSON.stringify({
        ref: `refs/heads/${branchName}`,
        sha: newCommit.sha
      })
    });

    console.log(`[6/6] Abrindo o Merge Request (Pull Request)...`);
    const pr = await this.request('/pulls', {
      method: 'POST',
      body: JSON.stringify({
        title: title,
        body: body,
        head: branchName,
        base: 'main'
      })
    });

    return pr.html_url; // Retorna o link para o macaco do admin clicar e aceitar
  }
}