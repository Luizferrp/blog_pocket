import { readFile, readdir, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { Huffman } from "../src/huffman_tree.js";

// Paths
const index_path = "./cache/htree.dat";
const compressed_path = "./articles";
const uncompressed_path = "./tmp";

// Make sure tmp exists
await mkdir(uncompressed_path, { recursive: true });

// Read the shared Huffman index
const shared_index = await readFile(index_path);

// Create the Huffman tree
const ht = new Huffman(shared_index);

// Read all compressed files
const files = await readdir(compressed_path);

for (const file of files) {
  const input_path = path.join(
    compressed_path,
    file
  );

  const output_path = path.join(
    uncompressed_path,
    file
  );

  // Read compressed content
  const compressed_content =
    await readFile(input_path);

  // Uncompress
  const uncompressed_content =
    ht.uncompress(compressed_content);

  // Write uncompressed content
  await writeFile(
    output_path,
    uncompressed_content
  );

  console.log(
    `${input_path} -> ${output_path}`
  );
}

console.log("Uncompression complete.");
