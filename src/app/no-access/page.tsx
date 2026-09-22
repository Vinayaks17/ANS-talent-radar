import { signOut } from "@/app/login/actions";
import { Button } from "@/components/ui/button";

export default function NoAccessPage() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-[var(--brand-cream)] px-4">
      <div className="max-w-md bg-white border rounded-xl p-6 text-center space-y-3">
        <h1 className="font-bold text-lg">No workspace yet</h1>
        <p className="text-sm text-muted-foreground">
          Your email isn&apos;t on any company&apos;s allow-list. Ask an admin to add you as a member, then sign in again.
        </p>
        <form action={signOut}>
          <Button variant="outline" type="submit">Sign out</Button>
        </form>
      </div>
    </main>
  );
}
