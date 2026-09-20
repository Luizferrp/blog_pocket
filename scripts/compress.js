import { readFiles } from "../src/util.js";
import { Huffman } from "../src/huffman_tree.js";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

// Make sure output directories exist
await mkdir("./cache", { recursive: true });
await mkdir("./articles", { recursive: true });

// Read every uncompressed file from ./tmp
const uncompressed_files = await readFiles("cache/", "./tmp/");

console.log(`Found ${uncompressed_files.size} files`);

// Compress all files using one shared Huffman tree
const {
  shared_index,
  compressed_files_content_map
} = Huffman.compress(uncompressed_files);

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