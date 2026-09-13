/**
 * src/compressor.js
 * Módulo de compressão/descompressão Huffman baseado em Uint8Array (bytes).
 */

export class BitWriter {
  constructor() {
    this.bytes = [];
    this.currentByte = 0;
    this.bitCount = 0;
  }

  writeBit(bit) {
    this.currentByte = (this.currentByte << 1) | (bit & 1);
    this.bitCount++;
    if (this.bitCount === 8) {
      this.bytes.push(this.currentByte);
      this.currentByte = 0;
      this.bitCount = 0;
    }
  }

  writeByte(byteValue) {
    for (let i = 7; i >= 0; i--) {
      this.writeBit((byteValue >> i) & 1);
    }
  }

  flush() {
    if (this.bitCount > 0) {
      this.currentByte <<= (8 - this.bitCount);
      this.bytes.push(this.currentByte);
      const remainingBits = this.bitCount;
      this.currentByte = 0;
      this.bitCount = 0;
      return remainingBits;
    }
    return 0;
  }

  toUint8Array() {
    return new Uint8Array(this.bytes);
  }
}

export class BitReader {
  constructor(uint8Array) {
    this.bytes = uint8Array;
    this.byteIndex = 0;
    this.bitIndex = 7;
  }

  readBit() {
    if (this.byteIndex >= this.bytes.length) return null;
    const bit = (this.bytes[this.byteIndex] >> this.bitIndex) & 1;
    this.bitIndex--;
    if (this.bitIndex < 0) {
      this.bitIndex = 7;
      this.byteIndex++;
    }
    return bit;
  }

  readByte() {
    let byteVal = 0;
    for (let i = 0; i < 8; i++) {
      const bit = this.readBit();
      if (bit === null) return null;
      byteVal = (byteVal << 1) | bit;
    }
    return byteVal;
  }
}

class HuffmanNode {
  constructor(byte = null, freq = 0, left = null, right = null) {
    this.byte = byte;
    this.freq = freq;
    this.left = left;
    this.right = right;
  }

  isLeaf() {
    return this.left === null && this.right === null;
  }
}

export class HuffmanCompressor {
  constructor() {
    this.treeRoot = null;
    this.codesMap = new Map(); // byte -> { codeBits: Array, length: number }
  }

  // --- CONSTRUÇÃO E REBALANCEAMENTO ---
  buildTreeFromFrequencies(frequencyTable) {
    const nodes = [];
    for (const [byte, freq] of Object.entries(frequencyTable)) {
      nodes.push(new HuffmanNode(Number(byte), freq));
    }

    if (nodes.length === 0) return;

    while (nodes.length > 1) {
      nodes.sort((a, b) => a.freq - b.freq);
      const left = nodes.shift();
      const right = nodes.shift();
      const parent = new HuffmanNode(null, left.freq + right.freq, left, right);
      nodes.push(parent);
    }

    this.treeRoot = nodes[0];
    this.codesMap.clear();
    this._generateCodes(this.treeRoot, []);
  }

  _generateCodes(node, currentPath) {
    if (!node) return;
    if (node.isLeaf()) {
      this.codesMap.set(node.byte, [...currentPath]);
      return;
    }
    this._generateCodes(node.left, [...currentPath, 0]);
    this._generateCodes(node.right, [...currentPath, 1]);
  }

  // --- SERIALIZAÇÃO DE HTREE.DAT ---
  serializeTree() {
    const writer = new BitWriter();
    
    const serializeNode = (node) => {
      if (node.isLeaf()) {
        writer.writeBit(1);
        writer.writeByte(node.byte);
      } else {
        writer.writeBit(0);
        serializeNode(node.left);
        serializeNode(node.right);
      }
    };

    serializeNode(this.treeRoot);
    writer.flush();
    return writer.toUint8Array();
  }

  deserializeTree(uint8Array) {
    const reader = new BitReader(uint8Array);

    const parseNode = () => {
      const flag = reader.readBit();
      if (flag === null) return null;

      if (flag === 1) {
        const byteVal = reader.readByte();
        return new HuffmanNode(byteVal);
      } else {
        const left = parseNode();
        const right = parseNode();
        return new HuffmanNode(null, 0, left, right);
      }
    };

    this.treeRoot = parseNode();
    this.codesMap.clear();
    this._generateCodes(this.treeRoot, []);
  }

  // --- ENCODE / DECODE DE ARTIGOS (.DAT) ---
  encode(textString) {
    if (!this.treeRoot) throw new Error("Árvore de Huffman não carregada.");

    const encoder = new TextEncoder();
    const inputBytes = encoder.encode(textString);
    const writer = new BitWriter();

    // Grava quantidade de bytes originais no cabeçalho (4 bytes uint32)
    const originalLength = inputBytes.length;
    writer.writeByte((originalLength >> 24) & 0xff);
    writer.writeByte((originalLength >> 16) & 0xff);
    writer.writeByte((originalLength >> 8) & 0xff);
    writer.writeByte(originalLength & 0xff);

    for (let i = 0; i < inputBytes.length; i++) {
      const byte = inputBytes[i];
      const code = this.codesMap.get(byte);
      if (!code) {
        throw new Error(`Byte ${byte} não encontrado na htree.dat atual.`);
      }
      for (const bit of code) {
        writer.writeBit(bit);
      }
    }

    writer.flush();
    return writer.toUint8Array();
  }

  decode(uint8Array) {
    if (!this.treeRoot) throw new Error("Árvore de Huffman não carregada.");

    const reader = new BitReader(uint8Array);

    // Lê os 4 bytes do cabeçalho com o tamanho original
    const b1 = reader.readByte();
    const b2 = reader.readByte();
    const b3 = reader.readByte();
    const b4 = reader.readByte();
    const originalLength = (b1 << 24) | (b2 << 16) | (b3 << 8) | b4;

    const outputBytes = new Uint8Array(originalLength);
    let currentNode = this.treeRoot;
    let decodedBytesCount = 0;

    while (decodedBytesCount < originalLength) {
      const bit = reader.readBit();
      if (bit === null) break;

      currentNode = bit === 0 ? currentNode.left : currentNode.right;

      if (currentNode.isLeaf()) {
        outputBytes[decodedBytesCount++] = currentNode.byte;
        currentNode = this.treeRoot;
      }
    }

    const decoder = new TextDecoder();
    return decoder.decode(outputBytes);
  }
}