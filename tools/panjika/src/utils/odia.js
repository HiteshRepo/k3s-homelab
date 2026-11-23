const DIGITS = '୦୧୨୩୪୫୬୭୮୯';
const EN_MONTHS_SHORT = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                          'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function toOdiaNum(n) {
  return String(n).split('').map(c => DIGITS[+c]).join('');
}

export function toEnShortDate(dateStr) {
  const [, m, d] = dateStr.split('-').map(Number);
  return `${EN_MONTHS_SHORT[m]} ${d}`;
}

// Compact tithi label for lunar calendar cells
export function toTithiLabel(tithiIndex) {
  if (tithiIndex === 14) return 'ପୂ';          // Purnima
  if (tithiIndex === 29) return 'ଅ';           // Amavasya
  if (tithiIndex <= 13) return `ଶୁ.${toOdiaNum(tithiIndex + 1)}`;
  return `କ.${toOdiaNum(tithiIndex - 14)}`;
}
