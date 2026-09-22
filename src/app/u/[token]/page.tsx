import { unsubscribe } from "./actions";

export const metadata = { title: "Unsubscribe" };

/** Landing page from the List-Unsubscribe header and the email footer. Public. */
export default async function UnsubscribePage(props: PageProps<"/u/[token]"> & { searchParams: Promise<{ done?: string }> }) {
  const { token } = await props.params;
  const { done } = await props.searchParams;
  return (
    <main className="min-h-screen flex items-center justify-center bg-[#F5F1E8] px-4 font-sans">
      <div className="max-w-md w-full bg-white border rounded-xl p-6 space-y-3 text-center">
        {done ? (
          <>
            <h1 className="font-bold text-lg">You&apos;re unsubscribed</h1>
            <p className="text-sm text-[#5B6470]">We won&apos;t email you again. Sorry for the interruption.</p>
          </>
        ) : (
          <>
            <h1 className="font-bold text-lg">Stop these emails?</h1>
            <p className="text-sm text-[#5B6470]">Confirm and we&apos;ll remove your address from all future outreach.</p>
            <form action={unsubscribe}>
              <input type="hidden" name="token" value={token} />
              <button type="submit" className="px-4 py-2 rounded-lg bg-[#0E2A5C] text-white text-sm font-semibold">Unsubscribe</button>
            </form>
          </>
        )}
      </div>
    </main>
  );
}
