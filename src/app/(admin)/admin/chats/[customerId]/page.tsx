import { AdminChatsView } from "@/components/admin/admin-chats-view";

interface AdminChatDetailPageProps {
  params: Promise<{ customerId: string }>;
}

export default async function AdminChatDetailPage({
  params,
}: AdminChatDetailPageProps) {
  const { customerId } = await params;
  return <AdminChatsView customerId={customerId} />;
}
