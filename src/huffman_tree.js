export class Huffman {
  /*
   * File format for the shared index:
   *
   *   4 bytes: magic "HT01"
   *   256 x uint32: frequency table
   *
   * Total: 1028 bytes
   *
   * We store frequencies rather than the actual tree.
   * The exact same tree can be reconstructed from them.
   *
   * Compressed file format:
   *
   *   4 bytes: original uncompressed byte length
   *   N bytes: Huffman bitstream
   *
   * The original length means we don't need to store padding bits.
   */

  static MAGIC = new Uint8Array([0x48, 0x54, 0x30, 0x31]); // "HT01"
  static SYMBOLS = 256;
  static HEADER_SIZE = 4;
  static INDEX_SIZE = 4 + (256 * 4);

  constructor(shared_index) {
    const index = Huffman.toBytes(shared_index);

    if (index.length < Huffman.INDEX_SIZE) {
      throw new Error("Invalid Huffman index");
    }

    // Check magic
    for (let i = 0; i < 4; i++) {
      if (index[i] !== Huffman.MAGIC[i]) {
        throw new Error("Invalid Huffman index magic");
      }
    }

    // Read frequencies
    const view = new DataView(
      index.buffer,
      index.byteOffset,
      index.byteLength
    );

    this.frequencies = new Uint32Array(Huffman.SYMBOLS);

    for (let i = 0; i < Huffman.SYMBOLS; i++) {
      this.frequencies[i] = view.getUint32(
        4 + (i * 4),
        true
      );
    }

    this._buildTree();
  }

  /*
   * Compress a Map:
   *
   * Map {
   *   "file1.dat" => "hello world",
   *   "file2.dat" => "another file"
   * }
   *
   * Returns:
   *
   * {
   *   shared_index,
   *   compressed_files_content_map
   * }
   */
  static compress(files_content_map) {
    if (!(files_content_map instanceof Map)) {
      throw new TypeError(
        "Huffman.compress() expects a Map"
      );
    }

    const frequencies = new Uint32Array(
      Huffman.SYMBOLS
    );

    // --------------------------------------------------
    // 1. Build the shared frequency table
    // --------------------------------------------------

    for (const content of files_content_map.values()) {
      const bytes = Huffman.toBytes(content);

      for (const byte of bytes) {
        frequencies[byte]++;
      }
    }

    // --------------------------------------------------
    // 2. Create a temporary Huffman instance
    // --------------------------------------------------

    const huffman = Huffman._fromFrequencies(frequencies);

    // --------------------------------------------------
    // 3. Serialize the shared index
    // --------------------------------------------------

    const shared_index =
      huffman._serializeIndex();

    // --------------------------------------------------
    // 4. Compress every file using the same tree
    // --------------------------------------------------

    const compressed_files_content_map = new Map();

    for (const [file, content] of files_content_map) {
      const compressed =
        huffman._compressContent(content);

      compressed_files_content_map.set(
        file,
        compressed
      );
    }

    return {
      shared_index,
      compressed_files_content_map
    };
  }

  /*
   * Convert strings / Uint8Array / ArrayBuffer into bytes.
   */
  static toBytes(value) {
    if (value instanceof Uint8Array) {
      return value;
    }

    if (value instanceof ArrayBuffer) {
      return new Uint8Array(value);
    }

    if (typeof value === "string") {
      return new TextEncoder().encode(value);
    }

    throw new TypeError(
      "Expected string, Uint8Array, or ArrayBuffer"
    );
  }

  /*
   * Create an instance without going through the serialized
   * index. Used internally by compress().
   */
  static _fromFrequencies(frequencies) {
    const huffman = Object.create(Huffman.prototype);

    huffman.frequencies =
      new Uint32Array(frequencies);

    huffman._buildTree();

    return huffman;
  }

  /*
   * Build Huffman tree.
   *
   * Tree nodes are stored in arrays rather than JS objects.
   * This makes decoding considerably cheaper.
   */
  _buildTree() {
    const frequencies = this.frequencies;

    const nodes = [];

    for (let symbol = 0; symbol < 256; symbol++) {
      if (frequencies[symbol] > 0) {
        nodes.push({
          frequency: frequencies[symbol],
          symbol,
          left: -1,
          right: -1
        });
      }
    }

    // Empty input
    if (nodes.length === 0) {
      this.root = -1;
      this.codes = new Array(256);
      return;
    }

    // Single-symbol file
    if (nodes.length === 1) {
      const only = nodes[0];

      this.nodes = nodes;
      this.root = 0;

      this.codes = new Array(256);

      this.codes[only.symbol] = {
        code: 0n,
        length: 1
      };

      this.left = new Int32Array(1);
      this.right = new Int32Array(1);
      this.symbol = new Int16Array(1);

      this.left[0] = -1;
      this.right[0] = -1;
      this.symbol[0] = only.symbol;

      return;
    }

    /*
     * Simple priority queue.
     *
     * There are at most 511 nodes for 256 symbols,
     * so this is perfectly adequate and keeps the code simple.
     */
    const queue = nodes.map((_, i) => i);

    const sortQueue = () => {
      queue.sort(
        (a, b) =>
          nodes[a].frequency -
          nodes[b].frequency
      );
    };

    sortQueue();

    while (queue.length > 1) {
      const left = queue.shift();
      const right = queue.shift();

      const parent = nodes.length;

      nodes.push({
        frequency:
          nodes[left].frequency +
          nodes[right].frequency,

        symbol: -1,
        left,
        right
      });

      queue.push(parent);

      sortQueue();
    }

    this.nodes = nodes;
    this.root = queue[0];

    // Convert object-ish nodes into compact arrays.
    const count = nodes.length;

    this.left = new Int32Array(count);
    this.right = new Int32Array(count);
    this.symbol = new Int16Array(count);

    for (let i = 0; i < count; i++) {
      this.left[i] = nodes[i].left;
      this.right[i] = nodes[i].right;
      this.symbol[i] = nodes[i].symbol;
    }

    // Build encoding codes.
    this.codes = new Array(256);

    const walk = (node, code, length) => {
      const symbol = this.symbol[node];

      if (symbol >= 0) {
        this.codes[symbol] = {
          code,
          length
        };

        return;
      }

      walk(
        this.left[node],
        code << 1n,
        length + 1
      );

      walk(
        this.right[node],
        (code << 1n) | 1n,
        length + 1
      );
    };

    walk(this.root, 0n, 0);
  }

  /*
   * Serialize the shared Huffman index.
   */
  _serializeIndex() {
    const buffer =
      new ArrayBuffer(Huffman.INDEX_SIZE);

    const bytes = new Uint8Array(buffer);
    const view = new DataView(buffer);

    bytes.set(Huffman.MAGIC, 0);

    for (let i = 0; i < 256; i++) {
      view.setUint32(
        4 + (i * 4),
        this.frequencies[i],
        true
      );
    }

    return bytes;
  }

  /*
   * Compress one file.
   *
   * Output:
   *
   *   4 bytes = original byte length
   *   remaining bytes = Huffman bitstream
   */
  _compressContent(content) {
    const input = Huffman.toBytes(content);

    /*
     * First determine how many bits we'll need.
     */
    let bitCount = 0;

    for (const byte of input) {
      const code = this.codes[byte];

      if (!code) {
        throw new Error(
          `No Huffman code for byte ${byte}`
        );
      }

      bitCount += code.length;
    }

    const compressedByteCount =
      Math.ceil(bitCount / 8);

    const output = new Uint8Array(
      4 + compressedByteCount
    );

    const view = new DataView(
      output.buffer,
      output.byteOffset,
      output.byteLength
    );

    // Original size
    view.setUint32(
      0,
      input.length,
      true
    );

    let bytePosition = 4;
    let bitPosition = 7;

    for (const byte of input) {
      const { code, length } =
        this.codes[byte];

      for (
        let bit = length - 1;
        bit >= 0;
        bit--
      ) {
        const value =
          Number((code >> BigInt(bit)) & 1n);

        if (value) {
          output[bytePosition] |=
            (1 << bitPosition);
        }

        bitPosition--;

        if (bitPosition < 0) {
          bitPosition = 7;
          bytePosition++;
        }
      }
    }

    return output;
  }

  /*
   * Decompress a single file.
   */
  uncompress(compressed_content) {
    const input =
      Huffman.toBytes(compressed_content);

    if (input.length < 4) {
      throw new Error(
        "Compressed Huffman data is too short"
      );
    }

    const view = new DataView(
      input.buffer,
      input.byteOffset,
      input.byteLength
    );

    const originalLength =
      view.getUint32(0, true);

    // Empty file
    if (originalLength === 0) {
      return "";
    }

    if (this.root < 0) {
      throw new Error(
        "Huffman tree is empty"
      );
    }

    /*
     * Special case: only one symbol exists.
     */
    const rootSymbol = this.symbol[this.root];

    if (rootSymbol >= 0) {
      return new TextDecoder().decode(
        new Uint8Array(
          originalLength
        ).fill(rootSymbol)
      );
    }

    const output =
      new Uint8Array(originalLength);

    let outputPosition = 0;
    let node = this.root;

    for (
      let bytePosition = 4;
      bytePosition < input.length &&
      outputPosition < originalLength;
      bytePosition++
    ) {
      const byte = input[bytePosition];

      for (
        let bitPosition = 7;
        bitPosition >= 0 &&
        outputPosition < originalLength;
        bitPosition--
      ) {
        const bit =
          (byte >> bitPosition) & 1;

        node =
          bit === 0
            ? this.left[node]
            : this.right[node];

        if (node < 0) {
          throw new Error(
            "Invalid Huffman stream"
          );
        }

        const symbol =
          this.symbol[node];

        if (symbol >= 0) {
          output[outputPosition++] =
            symbol;

          node = this.root;
        }
      }
    }

    if (outputPosition !== originalLength) {
      throw new Error(
        "Truncated Huffman stream"
      );
    }

    return new TextDecoder().decode(output);
  }
}