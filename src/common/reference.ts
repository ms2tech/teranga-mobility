/**
 * Génère une référence de réservation lisible et facile à dicter au
 * téléphone (sans caractères ambigus : pas de 0/O, 1/I).
 * Exemple : "TM-7K4F9A"
 */
const ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

export function generateBookingReference(prefix = 'TM'): string {
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return `${prefix}-${code}`;
}
