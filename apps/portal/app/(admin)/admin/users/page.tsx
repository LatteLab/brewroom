import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { getAllMembers } from "@/lib/db/event-queries";
import { PageHeader } from "@/components/ui/page-header";
import { MemberSearch } from "@/components/admin/users/member-search";

export default async function UsersPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!session.user.isAdmin) redirect("/user");

  const members = await getAllMembers();

  return (
    <>
      <PageHeader title="Team Directory" showSidebarTrigger />
      <MemberSearch members={members} />
    </>
  );
}
