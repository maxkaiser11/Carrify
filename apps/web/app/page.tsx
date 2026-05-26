import { currentUser } from "@clerk/nextjs/server";
import { RoleButtons } from "./role-buttons";

export default async function Home() {
  const user = await currentUser();
  return (
    <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center px-6">
      <div className="text-center max-w-2xl">
        <h1 className="text-5xl sm:text-6xl font-bold tracking-tight bg-gradient-to-br from-purple-500 to-purple-800 bg-clip-text text-transparent">
          Carrify
        </h1>
        <p className="mt-4 text-lg text-zinc-500">
          Pro-level game boosting, on demand.
        </p>

        {user?.firstName && (
          <p className="mt-8 text-xl">
            Welcome back, <span className="font-semibold">{user.firstName}</span> 👋
          </p>
        )}

        <div className="mt-8 flex justify-center">
          <RoleButtons />
        </div>
      </div>
    </div>
  );
}
