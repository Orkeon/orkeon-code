// SHA-1 vectors: the standard ones, padding edges, multi-byte text.

/** [input, its size in UTF-8 bytes, its SHA-1]. */
export const VECTORS: Array<[string, number, string]> = [
  ["", 0, "da39a3ee5e6b4b0d3255bfef95601890afd80709"],
  ["abc", 3, "a9993e364706816aba3e25717850c26c9cd0d89d"],
  ["abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq", 56, "84983e441c3bd26ebaae4aa1f95129e5e54670f1"],
  ["The quick brown fox jumps over the lazy dog", 43, "2fd4e1c67a2d28fced849ee1bb76e7391b93eb12"],
  ["a".repeat(1_000_000), 1_000_000, "34aa973cd4c4daa4f61eeb2bdbad27316534016f"],
  ["a".repeat(55), 55, "c1c8bbdc22796e28c0e15163d20899b65621d65a"],
  ["a".repeat(56), 56, "c2db330f6083854c99d4b5bfb6e8f29f201be699"],
  ["a".repeat(64), 64, "0098ba824b5c16427bd7a1122a5a442a25ec644d"],
  ["naïve — 𝄞", 15, "2be17516708fd5bcaccb0a7b976a8682645fe0e3"],
];

/** Lone surrogates, each encoded as U+FFFD. */
export const LONE_SURROGATES: readonly { readonly name: string; readonly text: string; readonly bytes: number[] }[] = [
  { name: "encodes a lone high surrogate as U+FFFD", text: "\uD800", bytes: [0xef, 0xbf, 0xbd] },
  { name: "encodes a lone low surrogate as U+FFFD, the text after it kept", text: "\uDC00x", bytes: [0xef, 0xbf, 0xbd, 0x78] },
];
