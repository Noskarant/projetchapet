// Restricted to explicit financial expressions; never rewrite names/addresses.
const values: Record<string, number> = { zero:0, un:1, une:1, deux:2, trois:3, quatre:4, cinq:5, six:6, sept:7, huit:8, neuf:9, dix:10, onze:11, douze:12, treize:13, quatorze:14, quinze:15, seize:16, vingt:20, trente:30, quarante:40, cinquante:50, soixante:60 };
const words = [...Object.keys(values), 'zéro', 'vingts', 'cent', 'cents', 'mille', 'et', 'virgule'].join('|');
export const spokenAmountPattern = `(?:\\d+(?:[,.]\\d+)?|(?:${words})(?:[ -]+(?:${words})){0,12})`;

export function spokenFinancialNumber(input: string): number | null {
  const numeric = Number(input.replace(/\s/g,'').replace(',','.'));
  if (Number.isFinite(numeric) && input.trim()) return numeric >= 0 ? numeric : null;
  const tokens = input.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim().split(/[ -]+/);
  const comma = tokens.indexOf('virgule');
  if (comma >= 0) {
    const whole = spokenFinancialNumber(tokens.slice(0,comma).join(' '));
    const fraction = spokenFinancialNumber(tokens.slice(comma+1).join(' '));
    if (whole === null || fraction === null || fraction >= 1000) return null;
    const digits = tokens.slice(comma+1).map(token=>values[token]).every(value=>value !== undefined && value < 10)
      ? tokens.slice(comma+1).map(token=>values[token]).join('') : String(fraction);
    return whole + Number(`0.${digits}`);
  }
  let total=0, group=0, sawNumber=false;
  for (let index=0;index<tokens.length;index++) {
    const token=tokens[index];
    if (token==='et') continue;
    if (token==='cent' || token==='cents') { group=(group || 1)*100; sawNumber=true; }
    else if (token==='mille') { total+=(group || 1)*1000; group=0; sawNumber=true; }
    else if (token==='quatre' && ['vingt','vingts'].includes(tokens[index+1])) { group+=80; index++; sawNumber=true; }
    else if (values[token] !== undefined) { group+=values[token]; sawNumber=true; }
    else return null;
  }
  return sawNumber ? total+group : null;
}
