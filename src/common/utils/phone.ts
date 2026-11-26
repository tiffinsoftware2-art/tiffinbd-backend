// One standard form for Bangladeshi phone numbers, so the same customer is
// always the same key: "+880 1712-345678", "8801712345678", "1712345678" and
// "01712345678" all become "01712345678". Anything that does not look like a
// Bangladeshi mobile number keeps its digits as typed. Blank → ''.
export function normalizePhone(raw: unknown): string {
  if (typeof raw !== 'string' && typeof raw !== 'number') return '';
  let d = String(raw).replace(/\D/g, '');
  if (d.startsWith('00880')) d = d.slice(2);
  if (d.startsWith('880') && d.length === 13) return '0' + d.slice(3);
  if (d.startsWith('1') && d.length === 10) return '0' + d;
  return d.slice(0, 20);
}
