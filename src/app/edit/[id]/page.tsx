import { Studio } from "@/components/studio";
export default async function EditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <Studio albumId={id} />;
}
