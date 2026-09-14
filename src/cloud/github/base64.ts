/**
 * UTF-8 safe base64, for the GitHub contents API (which is base64 in both directions).
 *
 * `btoa` operates on Latin-1 and throws an InvalidCharacterError on any code point above
 * 0xFF, so `btoa(JSON.stringify(doc))` fails the moment a label is named "Kaffeposer for
 * høsten" — which, for this app's primary user, is immediately. Encode to UTF-8 bytes
 * first and hand `btoa` one byte per character.
 */

export function encodeBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  // String.fromCharCode(...bytes) blows the argument limit on a project carrying an
  // embedded image, so chunk it.
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

export function decodeBase64(base64: string): string {
  // GitHub wraps its base64 output at 60 characters; atob rejects the newlines.
  const binary = atob(base64.replace(/\s/g, ''));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new TextDecoder().decode(bytes);
}
