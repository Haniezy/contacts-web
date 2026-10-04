import { DuplicatesView } from '../duplicates-view';

export default async function Merge({
  searchParams,
}: {
  searchParams: Promise<{ ids?: string | string[] }>;
}) {
  const { ids } = await searchParams;
  return <DuplicatesView ids={typeof ids === 'string' ? ids : ''} />;
}
