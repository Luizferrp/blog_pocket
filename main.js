import { HuffmanCompressor } from './compressor.js';

const compressor = new HuffmanCompressor();

// 1. Baixar e carregar a htree.dat global
const htreeRes = await fetch('/cache/htree.dat');
const htreeArrayBuffer = await htreeRes.arrayBuffer();
compressor.deserializeTree(new Uint8Array(htreeArrayBuffer));

// 2. Baixar e descomprimir um artigo sob demanda
const articleRes = await fetch('/articles/artigo_001.dat');
const articleArrayBuffer = await articleRes.arrayBuffer();
const textoOriginal = compressor.decode(new Uint8Array(articleArrayBuffer));

console.log("Artigo Renderizado:", textoOriginal);