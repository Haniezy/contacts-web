export type Contact = {
  id: string;
  name: string;
  phone: string;
  photoUrl: string | null;
  birthday: string | null;
  reminder: string | null;
};
export type ContactPage = {
  contacts: Contact[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
};
export type DuplicateGroup = {
  by: 'phone' | 'name';
  value: string;
  count: number;
  hasMore: boolean;
  contacts: Contact[];
};
export type DuplicatePage = {
  groups: DuplicateGroup[];
  pagination: ContactPage['pagination'];
};

export const pageSize = 50;
// Duplicates are contacts sharing a phone number or a name (normalized by
// the API); "all" lists phone groups first, each group once.
export const duplicatePageSize = 100;
export const duplicatesPath = `contacts/duplicates?by=all&pageSize=${duplicatePageSize}`;
// The badge counts groups; the total comes with any page, so one is enough.
export const duplicateCountPath = 'contacts/duplicates?by=all&pageSize=1';

export function initial(name: string) {
  const first = [...name.trim()][0] ?? '#';
  const letter = first.replace('ي', 'ی').replace('ك', 'ک').toLocaleUpperCase();
  return /\p{L}/u.test(letter) ? letter : '#';
}

// The API already sorts alphabetically, so equal initials are adjacent.
export function groupByInitial(contacts: Contact[]) {
  const groups: { letter: string; contacts: Contact[] }[] = [];
  for (const contact of contacts) {
    const letter = initial(contact.name);
    if (groups.at(-1)?.letter !== letter) groups.push({ letter, contacts: [] });
    groups.at(-1)!.contacts.push(contact);
  }
  return groups;
}

// Stable per contact, so a colour never changes while searching or paging.
export function avatarTone(id: string) {
  let hash = 0;
  for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) | 0;
  return Math.abs(hash) % 4;
}

// Display grouping only; tel:/sms: links keep the stored value.
export function formatPhone(phone: string) {
  if (/^09\d{9}$/.test(phone))
    return `${phone.slice(0, 4)} ${phone.slice(4, 7)} ${phone.slice(7)}`;
  if (/^\+989\d{9}$/.test(phone))
    return `+98 ${phone.slice(3, 6)} ${phone.slice(6, 9)} ${phone.slice(9)}`;
  return phone;
}
