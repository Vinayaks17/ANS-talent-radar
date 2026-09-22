import { LoginForm } from "./login-form";

export const metadata = { title: "Sign in · Talent Radar" };

export default async function LoginPage(props: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const { next, error } = await props.searchParams;
  return (
    <main className="min-h-screen flex items-center justify-center bg-[var(--brand-cream)] px-4">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-3 mb-8">
          <div className="w-10 h-10 rounded-lg bg-[var(--brand-coral)] text-[var(--brand-navy)] font-bold flex items-center justify-center text-sm">TR</div>
          <div>
            <div className="font-bold text-lg leading-tight">Talent Radar</div>
            <div className="text-xs text-muted-foreground">Candidate intelligence</div>
          </div>
        </div>
        <LoginForm next={next ?? "/"} initialError={error} />
      </div>
    </main>
  );
}
