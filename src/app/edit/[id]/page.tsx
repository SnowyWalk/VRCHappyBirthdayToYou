import { AlbumEditor } from "@/components/album-editor";
export default async function EditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <AlbumEditor id={id} />;
}
