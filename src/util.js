export async function readFiles(path_to_index="../cache/", actual_files_path = "articles", articles_extension = ".dat") {
  const isNode =
    typeof process !== "undefined" &&
    process.versions?.node;

  let articles;

  // Read the index
  if (isNode) {
    const { readFile } = await import("node:fs/promises");

    const indexPath = path_to_index + "articles.dat";
    const content = await readFile(indexPath, "utf8");

    articles = JSON.parse(content);
  } else {
    const response = await fetch(path_to_index + "articles.dat");

    if (!response.ok) {
      throw new Error(
        `Failed to fetch articles.dat: ${response.status} ${response.statusText}`
      );
    }

    articles = await response.json();
  }

  // Read all articles
  const files = await Promise.all(
    articles.map(async article => {
      const file = actual_files_path + article.article_id + articles_extension;
      const path = file;

      let content;

      if (isNode) {
        const { readFile } = await import("node:fs/promises");
        content = await readFile(path, "utf8");
      } else {
        const response = await fetch(path);

        if (!response.ok) {
          throw new Error(
            `Failed to fetch ${file}: ${response.status} ${response.statusText}`
          );
        }

        content = await response.text();
      }

      return [file, content];
    })
  );

  return new Map(files);
}