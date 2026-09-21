export class tf_idf {
    /*
     * Binary format
     *
     * Header (20 bytes)
     *   0   4   magic "TFID"
     *   4   2   version
     *   6   2   flags
     *   8   4   document count
     *   12  4   term count
     *   16  4   document table offset
     *
     * Document table:
     *   repeated:
     *     uint32 filename_offset
     *
     * Filename blob:
     *   repeated:
     *     uint32 byte_length
     *     uint8[] UTF-8 filename
     *
     * Term offset table:
     *   uint32[term_count + 1]
     *
     * Term blob:
     *   concatenated UTF-8 terms
     *
     * Term metadata:
     *   repeated term_count times:
     *     uint16 idf * 256
     *     uint32 postings_offset
     *     uint32 postings_length
     *
     * Postings:
     *   repeated per term:
     *     varuint article_id_delta
     *     varuint term_frequency
     */

    static VERSION = 1;

    static build_index(documents) {
        if (!documents || typeof documents !== "object") {
            throw new TypeError("documents must be an object: { filename: content }");
        }

        const encoder = new TextEncoder();

        const filenames = Object.keys(documents);
        const documentCount = filenames.length;

        // term -> Map(documentId -> term frequency)
        const inverted = new Map();

        for (let docId = 0; docId < filenames.length; docId++) {
            const filename = filenames[docId];
            const content = String(documents[filename]);

            const terms = tf_idf.tokenize(content);

            // TF for this document.
            const frequencies = new Map();

            for (const term of terms) {
                frequencies.set(term, (frequencies.get(term) || 0) + 1);
            }

            for (const [term, tf] of frequencies) {
                let postings = inverted.get(term);

                if (!postings) {
                    postings = [];
                    inverted.set(term, postings);
                }

                postings.push([docId, tf]);
            }
        }

        /*
         * Sort terms so the runtime can binary-search the dictionary.
         */
        const terms = Array.from(inverted.keys()).sort();

        /*
         * Build UTF-8 term blob and offset table.
         */
        const termBytes = [];
        const termOffsets = new Uint32Array(terms.length + 1);

        let termBlobSize = 0;

        for (let i = 0; i < terms.length; i++) {
            const bytes = encoder.encode(terms[i]);

            termBytes.push(bytes);
            termOffsets[i] = termBlobSize;
            termBlobSize += bytes.length;
        }

        termOffsets[terms.length] = termBlobSize;

        /*
         * Build postings first because their lengths are needed
         * by the term metadata.
         */
        const postingBuffers = new Array(terms.length);
        const postingLengths = new Uint32Array(terms.length);

        for (let i = 0; i < terms.length; i++) {
            const postings = inverted.get(terms[i]);

            const bytes = [];

            let previousDocument = 0;

            for (const [documentId, tf] of postings) {
                const delta = documentId - previousDocument;

                tf_idf.writeVarUint(bytes, delta);
                tf_idf.writeVarUint(bytes, tf);

                previousDocument = documentId;
            }

            const buffer = Uint8Array.from(bytes);

            postingBuffers[i] = buffer;
            postingLengths[i] = buffer.length;
        }

        /*
         * IDF is:
         *
         *     log(N / DF)
         *
         * We quantize it to uint16 with 8 fractional bits.
         *
         * 8 bits of fraction is more than enough for ranking.
         */
        const idfs = new Uint16Array(terms.length);

        for (let i = 0; i < terms.length; i++) {
            const df = inverted.get(terms[i]).length;

            const idf = Math.log(documentCount / df);

            idfs[i] = Math.min(
                65535,
                Math.round(idf * 256)
            );
        }

        /*
         * Filename blob.
         */
        const filenameBytes = [];
        let filenameBlobSize = 0;

        for (const filename of filenames) {
            const bytes = encoder.encode(filename);

            const length = new Uint8Array(4);
            new DataView(length.buffer).setUint32(0, bytes.length, true);

            filenameBytes.push(length);
            filenameBytes.push(bytes);

            filenameBlobSize += 4 + bytes.length;
        }

        /*
         * Layout.
         */
        const HEADER_SIZE = 20;
        const documentTableOffset = HEADER_SIZE;
        const documentTableSize = documentCount * 4;

        const filenameBlobOffset =
            documentTableOffset + documentTableSize;

        const termOffsetTableOffset =
            filenameBlobOffset + filenameBlobSize;

        const termOffsetTableSize =
            (terms.length + 1) * 4;

        const termBlobOffset =
            termOffsetTableOffset + termOffsetTableSize;

        const termMetadataOffset =
            termBlobOffset + termBlobSize;

        // idf uint16 + posting offset uint32 + posting length uint32
        const TERM_METADATA_SIZE = 10;

        const postingsOffset =
            termMetadataOffset +
            terms.length * TERM_METADATA_SIZE;

        let totalPostingSize = 0;

        for (const buffer of postingBuffers) {
            totalPostingSize += buffer.length;
        }

        const totalSize =
            postingsOffset + totalPostingSize;

        const output = new Uint8Array(totalSize);
        const view = new DataView(output.buffer);

        /*
         * Header
         */
        output[0] = 0x54; // T
        output[1] = 0x46; // F
        output[2] = 0x49; // I
        output[3] = 0x44; // D

        view.setUint16(4, tf_idf.VERSION, true);
        view.setUint16(6, 0, true);

        view.setUint32(8, documentCount, true);
        view.setUint32(12, terms.length, true);
        view.setUint32(16, documentTableOffset, true);

        /*
         * Document table.
         */
        for (let i = 0; i < documentCount; i++) {
            view.setUint32(
                documentTableOffset + i * 4,
                filenameBlobOffset + tf_idf.filenameOffset(
                    filenames,
                    i,
                    encoder
                ),
                true
            );
        }

        /*
         * Filename blob.
         */
        let p = filenameBlobOffset;

        for (const bytes of filenameBytes) {
            output.set(bytes, p);
            p += bytes.length;
        }

        /*
         * Term offsets.
         */
        p = termOffsetTableOffset;

        for (let i = 0; i < termOffsets.length; i++) {
            view.setUint32(p, termOffsets[i], true);
            p += 4;
        }

        /*
         * Terms.
         */
        p = termBlobOffset;

        for (const bytes of termBytes) {
            output.set(bytes, p);
            p += bytes.length;
        }

        /*
         * Term metadata.
         */
        p = termMetadataOffset;

        let postingPosition = 0;

        for (let i = 0; i < terms.length; i++) {
            view.setUint16(p, idfs[i], true);
            p += 2;

            view.setUint32(
                p,
                postingsOffset + postingPosition,
                true
            );
            p += 4;

            view.setUint32(
                p,
                postingLengths[i],
                true
            );
            p += 4;

            postingPosition += postingLengths[i];
        }

        /*
         * Postings.
         */
        p = postingsOffset;

        for (const buffer of postingBuffers) {
            output.set(buffer, p);
            p += buffer.length;
        }

        return output;
    }

    constructor(data) {
        if (data instanceof ArrayBuffer) {
            this.data = new Uint8Array(data);
        } else if (ArrayBuffer.isView(data)) {
            this.data = new Uint8Array(
                data.buffer,
                data.byteOffset,
                data.byteLength
            );
        } else {
            throw new TypeError(
                "tf_idf expects ArrayBuffer, Uint8Array, or another ArrayBuffer view"
            );
        }

        if (this.data.length < 20) {
            throw new Error("Invalid TF-IDF index");
        }

        this.view = new DataView(
            this.data.buffer,
            this.data.byteOffset,
            this.data.byteLength
        );

        if (
            this.data[0] !== 0x54 ||
            this.data[1] !== 0x46 ||
            this.data[2] !== 0x49 ||
            this.data[3] !== 0x44
        ) {
            throw new Error("Invalid TF-IDF index magic");
        }

        const version = this.view.getUint16(4, true);

        if (version !== tf_idf.VERSION) {
            throw new Error(
                `Unsupported TF-IDF index version: ${version}`
            );
        }

        this.documentCount = this.view.getUint32(8, true);
        this.termCount = this.view.getUint32(12, true);
        this.documentTableOffset = this.view.getUint32(16, true);

        /*
         * Locate the structures.
         */
        this.documentTableSize = this.documentCount * 4;

        this.filenameBlobOffset =
            this.documentTableOffset +
            this.documentTableSize;

        /*
         * We need to find the end of the filename blob.
         *
         * The last filename's offset + its length gives us
         * the start of the term offset table.
         */
        let lastFilenameOffset = 0;

        if (this.documentCount > 0) {
            lastFilenameOffset =
                this.view.getUint32(
                    this.documentTableOffset +
                    (this.documentCount - 1) * 4,
                    true
                );
        } else {
            lastFilenameOffset = this.filenameBlobOffset;
        }

        let q = lastFilenameOffset;

        if (this.documentCount > 0) {
            const filenameLength =
                this.view.getUint32(q, true);

            q += 4 + filenameLength;
        }

        this.termOffsetTableOffset = q;

        this.termBlobOffset =
            this.termOffsetTableOffset +
            (this.termCount + 1) * 4;

        /*
         * Find term blob size from the final offset.
         */
        const finalTermOffset =
            this.view.getUint32(
                this.termOffsetTableOffset +
                this.termCount * 4,
                true
            );

        this.termMetadataOffset =
            this.termBlobOffset +
            finalTermOffset;

        this.termMetadataSize =
            this.termCount * 10;
    }

    search(query, limit = 5) {
        if (!query || limit <= 0) {
            return [];
        }

        const terms = tf_idf.tokenize(query);

        if (terms.length === 0) {
            return [];
        }

        /*
         * Don't process the same query term twice.
         */
        const uniqueTerms = [...new Set(terms)];

        /*
         * article ID -> score
         */
        const scores = new Map();

        for (const term of uniqueTerms) {
            const index = this.findTerm(term);

            if (index < 0) {
                continue;
            }

            const idf =
                this.view.getUint16(
                    this.termMetadataOffset +
                    index * 10,
                    true
                ) / 256;

            const postingOffset =
                this.view.getUint32(
                    this.termMetadataOffset +
                    index * 10 +
                    2,
                    true
                );

            const postingLength =
                this.view.getUint32(
                    this.termMetadataOffset +
                    index * 10 +
                    6,
                    true
                );

            this.readPostings(
                postingOffset,
                postingLength,
                idf,
                scores
            );
        }

        /*
         * Keep only the best results instead of sorting the
         * entire corpus.
         */
        const results = [];

        for (const [documentId, score] of scores) {
            results.push({
                id: this.getFilename(documentId),
                score
            });
        }

        results.sort((a, b) => b.score - a.score);
        console.log(`tfidf: search: ${results}`)
        return results.slice(0, limit);
    }

    findTerm(term) {
        const encoder = new TextEncoder();
        const target = encoder.encode(term);

        let low = 0;
        let high = this.termCount - 1;

        while (low <= high) {
            const mid = (low + high) >>> 1;

            const start =
                this.view.getUint32(
                    this.termOffsetTableOffset +
                    mid * 4,
                    true
                );

            const end =
                this.view.getUint32(
                    this.termOffsetTableOffset +
                    (mid + 1) * 4,
                    true
                );

            const comparison =
                tf_idf.compareUtf8(
                    this.data,
                    this.termBlobOffset + start,
                    end - start,
                    target
                );

            if (comparison === 0) {
                return mid;
            }

            if (comparison < 0) {
                low = mid + 1;
            } else {
                high = mid - 1;
            }
        }

        return -1;
    }

    readPostings(offset, length, idf, scores) {
        const end = offset + length;

        let position = offset;
        let documentId = 0;

        while (position < end) {
            let result = tf_idf.readVarUint(
                this.data,
                position
            );

            documentId += result.value;
            position = result.next;

            result = tf_idf.readVarUint(
                this.data,
                position
            );

            const tf = result.value;
            position = result.next;

            const score = tf * idf;

            scores.set(
                documentId,
                (scores.get(documentId) || 0) + score
            );
        }
    }

    getFilename(documentId) {
        const offset =
            this.view.getUint32(
                this.documentTableOffset +
                documentId * 4,
                true
            );

        const length =
            this.view.getUint32(offset, true);

        const bytes =
            this.data.subarray(
                offset + 4,
                offset + 4 + length
            );

        return new TextDecoder().decode(bytes);
    }

    static tokenize(text) {
        /*
         * Simple Unicode-aware tokenizer.
         *
         * Lowercase is important because the dictionary is
         * normalized during build and during search.
         */
        return String(text)
            .toLocaleLowerCase()
            .normalize("NFKC")
            .match(/[\p{L}\p{N}]+/gu) || [];
    }

    static writeVarUint(output, value) {
        while (value >= 128) {
            output.push((value & 127) | 128);
            value = Math.floor(value / 128);
        }

        output.push(value);
    }

    static readVarUint(data, offset) {
        let value = 0;
        let shift = 0;
        let position = offset;

        while (true) {
            const byte = data[position++];

            value += (byte & 127) * Math.pow(2, shift);

            if ((byte & 128) === 0) {
                break;
            }

            shift += 7;

            if (shift > 49) {
                throw new Error("Invalid VarInt");
            }
        }

        return {
            value,
            next: position
        };
    }

    static compareUtf8(data, offset, length, target) {
        const n = Math.min(length, target.length);

        for (let i = 0; i < n; i++) {
            const a = data[offset + i];
            const b = target[i];

            if (a < b) return -1;
            if (a > b) return 1;
        }

        if (length < target.length) return -1;
        if (length > target.length) return 1;

        return 0;
    }

    static filenameOffset(filenames, index, encoder) {
        let offset = 0;

        for (let i = 0; i < index; i++) {
            offset += 4 + encoder.encode(filenames[i]).length;
        }

        return offset;
    }
}
