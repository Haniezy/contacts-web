import { ContactsView } from '../../contacts-view';

export default async function EditContact({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ContactsView form={{ mode: 'edit', id }} />;
}
