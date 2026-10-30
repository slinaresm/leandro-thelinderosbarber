export function publicMeta(title: string, description: string, path: string) {
  const tags: Array<Record<string, string>> = [{ title }, { name: 'description', content: description }];
  const origin = import.meta.env.VITE_SITE_URL;
  if (origin) {
    const url = new URL(origin);
    if (url.protocol !== 'https:' || url.pathname !== '/' || url.search || url.hash || url.username || url.password) throw new Error('VITE_SITE_URL debe ser un origen HTTPS sin ruta.');
    tags.push({ tagName: 'link', rel: 'canonical', href: url.origin + path });
  }
  return tags;
}
