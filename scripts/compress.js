import { readFiles } from "../src/util.js";
import { Huffman } from "../src/huffman_tree.js";
import { tf_idf } from "../src/search.js";

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

// Make sure output directories exist
await mkdir("./cache", { recursive: true });
await mkdir("./articles", { recursive: true });

const uncompressed_files = await readFiles("cache/", "./tmp/");
console.log(`Found ${uncompressed_files.size} files`);

const uncompressed_files_clean = new Map();

for (const [key, value] of uncompressed_files) {
  const newKey = key.replace("./tmp/", "").replace(".dat", "");

  uncompressed_files_clean.set(newKey, value);
}

console.log(`Found ${uncompressed_files_clean.size} files`);

// ---------------------------------------------------------
// Build TF-IDF search index
// ---------------------------------------------------------

console.log("Building search index...");

const search_index = tf_idf.build_index(
  Object.fromEntries(uncompressed_files_clean)
);

await writeFile(
  "./cache/search.dat",
  search_index
);

console.log(
  `Search index written to ./cache/search.dat (${search_index.byteLength} bytes)`
);

// ---------------------------------------------------------
// Compress all files using one shared Huffman tree
// ---------------------------------------------------------

const {
  shared_index,
  compressed_files_content_map
} = Huffman.compress(uncompressed_files_clean);

// Write the shared Huffman index
await writeFile(
  "./cache/htree.dat",
  shared_index
);

// Write compressed files
for (
  const [file, compressed_content]
  of compressed_files_content_map
) {
  // "./tmp/art_test.dat"
  //              ↓
  // "art_test.dat"
  const filename = path.basename(file);

  const output_path =
    path.join("./articles", filename);

  await writeFile(
    output_path,
    compressed_content
  );

  console.log(
    `${file} -> ${output_path}`
  );
}

console.log("Compression complete.");
console.log("Cache update complete.");
