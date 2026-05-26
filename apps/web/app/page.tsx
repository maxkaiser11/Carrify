import { currentUser } from "@clerk/nextjs/server";
import { RoleButtons } from "./role-buttons";

export default async function Home() {
  const user = await currentUser();
  return (
    <div className="h-screen flex items-center justify-center flex-col gap-5">
      {user?.firstName && <h1 className="text-2xl font-bold">Welcome, {user.firstName}</h1>}
      <RoleButtons />
    </div>
  );
}
