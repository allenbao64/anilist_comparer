/**
 * Utility to guess base franchise name from an AniList anime title.
 * E.g.:
 * "Jujutsu Kaisen Season 2" -> "Jujutsu Kaisen"
 * "My Hero Academia 4" -> "My Hero Academia"
 * "Attack on Titan Final Season Part 2" -> "Attack on Titan"
 * "Mob Psycho 100 II" -> "Mob Psycho 100"
 * "Code Geass: Lelouch of the Rebellion R2" -> "Code Geass: Lelouch of the Rebellion"
 */
export function simplifyFranchiseTitle(title: string): string {
  let cleaned = title.trim();

  // Pattern replacements for common sequel / season suffixes
  const seasonSuffixPatterns = [
    // "Season 2", "2nd Season", "Season 3 Part 2", "Final Season"
    /\s*[:-]?\s*(the\s*)?(final|first|second|third|fourth|fifth)?\s*season(\s*part\s*\d+)?\b/i,
    /\s*[:-]?\s*\d+(st|nd|rd|th)\s*season\b/i,
    /\s*[:-]?\s*s\d+(\s*part\s*\d+)?\b/i,
    // "Part 2", "Part II"
    /\s*[:-]?\s*part\s*(\d+|[ivx]+)\b/i,
    // "Cour 2"
    /\s*[:-]?\s*cour\s*\d+\b/i,
    // "R2"
    /\s+r2\b/i,
    // Ending roman numerals or digits like "Mob Psycho 100 II" -> "Mob Psycho 100", but not 100 itself
    /\s+(ii|iii|iv|v|vi)\b/i,
  ];

  for (const pattern of seasonSuffixPatterns) {
    cleaned = cleaned.replace(pattern, '');
  }

  return cleaned.trim() || title;
}
