import { buildUsageReport } from "@/lib/usage";
import { kvConfigured } from "@/lib/kv";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

// Reads live KV generation logs - see the same note in admin/clients/page.tsx
// for why this must not be statically prerendered.
export const dynamic = "force-dynamic";

function formatUsd(amount: number): string {
  return amount.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 });
}

export default async function UsagePage() {
  const report = await buildUsageReport();

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-8">
      <h1 className="text-2xl font-bold tracking-tight">
        Usage & cost <span className="font-serif font-normal italic text-accent-gold-text">estimate</span>
      </h1>

      {!kvConfigured() && (
        <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
          Vercel KV isn&apos;t configured yet, so no generations have been logged. Numbers below
          will be empty until KV is connected.
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">This month&apos;s generations</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">{report.currentMonth.generations}</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">Tokens this month</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">
            {(report.currentMonth.inputTokens + report.currentMonth.outputTokens).toLocaleString()}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">Estimated cost this month</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">
            {formatUsd(report.currentMonth.estimatedCostUsd)}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">By month</CardTitle>
        </CardHeader>
        <CardContent>
          <table className="w-full text-sm">
            <thead className="text-left text-muted-foreground">
              <tr>
                <th className="py-1 font-normal">Month</th>
                <th className="py-1 font-normal">Generations</th>
                <th className="py-1 font-normal">Tokens</th>
                <th className="py-1 font-normal">Est. cost</th>
              </tr>
            </thead>
            <tbody>
              {report.byMonth.map((m) => (
                <tr key={m.month} className="border-t">
                  <td className="py-1.5">{m.month}</td>
                  <td className="py-1.5">{m.generations}</td>
                  <td className="py-1.5">{(m.inputTokens + m.outputTokens).toLocaleString()}</td>
                  <td className="py-1.5">{formatUsd(m.estimatedCostUsd)}</td>
                </tr>
              ))}
              {report.byMonth.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-3 text-muted-foreground">
                    No generations logged yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">By user (all time)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            {report.byUser.map((u) => (
              <div key={u.userEmail} className="flex justify-between">
                <span>{u.userEmail}</span>
                <span className="text-muted-foreground">
                  {u.generations} · {formatUsd(u.estimatedCostUsd)}
                </span>
              </div>
            ))}
            {report.byUser.length === 0 && <p className="text-muted-foreground">No data yet.</p>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">By client (all time)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            {report.byClient.map((c) => (
              <div key={c.clientName} className="flex justify-between">
                <span>{c.clientName}</span>
                <span className="text-muted-foreground">
                  {c.generations} · {formatUsd(c.estimatedCostUsd)}
                </span>
              </div>
            ))}
            {report.byClient.length === 0 && <p className="text-muted-foreground">No data yet.</p>}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
