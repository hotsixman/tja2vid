export type TjaEncoding = 'auto' | 'utf-8' | 'shift_jis' | 'euc-kr' | 'gb18030' | 'utf-16le';

export const ENCODINGS: { value: TjaEncoding; label: string }[] = [
  { value: 'auto', label: '자동 감지 (UTF-8 → Shift_JIS)' },
  { value: 'utf-8', label: 'UTF-8' },
  { value: 'shift_jis', label: 'Shift_JIS (일본어)' },
  { value: 'euc-kr', label: 'EUC-KR / CP949 (한국어)' },
  { value: 'gb18030', label: 'GB18030 (중국어)' },
  { value: 'utf-16le', label: 'UTF-16 LE' },
];

/**
 * Decodes a TJA file. TJA files in the wild are mostly Shift_JIS or UTF-8 (often
 * with BOM), so "auto" honours a BOM, then tries strict UTF-8, then Shift_JIS.
 */
export function decodeTja(buf: ArrayBuffer | Uint8Array, encoding: TjaEncoding = 'auto'): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  if (encoding !== 'auto') return new TextDecoder(encoding).decode(bytes);

  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return new TextDecoder('utf-8').decode(bytes.subarray(3));
  }
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder('utf-16le').decode(bytes.subarray(2));
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder('utf-16be').decode(bytes.subarray(2));
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder('shift_jis').decode(bytes);
  }
}
