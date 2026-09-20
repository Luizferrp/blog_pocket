from pathlib import Path
import json


BOOKS_DIR = Path("/Users/luizp/Documents/lopes/blog_pocket/tmp_2/books")
OUTPUT_DIR = Path("/Users/luizp/Documents/lopes/blog_pocket/tmp")
ARTICLES_FILE = Path(
    "/Users/luizp/Documents/lopes/blog_pocket/cache/articles.dat"
)


def dfs(directory: Path):
    for path in directory.iterdir():
        if path.is_dir():
            yield from dfs(path)
        elif path.is_file() and path.suffix == ".json":
            yield path


def process_file(json_path: Path):
    book = json_path.parent.parent.name
    chapter = json_path.stem

    article_id = f"{book}_{chapter}"

    with json_path.open("r", encoding="utf-8") as f:
        data = json.load(f)

    # Concatenate all verse texts.
    text = "".join(verse["text"] for verse in data["verses"])

    output_path = OUTPUT_DIR / f"{article_id}.txt"

    with output_path.open("w", encoding="utf-8") as f:
        f.write(text)

    return {
        "article_id": article_id,
        "title": article_id,
    }


def main():
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    ARTICLES_FILE.parent.mkdir(parents=True, exist_ok=True)

    articles = []

    for json_path in dfs(BOOKS_DIR):
        article = process_file(json_path)
        articles.append(article)

    # Sort alphabetically by article_id
    articles.sort(key=lambda article: article["article_id"])

    with ARTICLES_FILE.open("w", encoding="utf-8") as f:
        json.dump(articles, f, ensure_ascii=False, indent=2)

    print(f"Created {len(articles)} articles")
    print(f"Articles file: {ARTICLES_FILE}")


if __name__ == "__main__":
    main()
