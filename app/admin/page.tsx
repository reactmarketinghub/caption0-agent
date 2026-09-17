import { buildUsageReport } from "@/lib/usage";
import { kvConfigured } from "@/lib/kv";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

function formatUsd(amount: number): string {
  return amount.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 });
}

export default async function UsagePage() {
  const report = await buildUsageReport();

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-8">
      <h1 className="text-xl font-semibold">Usage & cost estimate</h1>

      {!kvConfigured() && (
        <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
          Vercel KV isn&apos;t configured yet, so no generations have been logged. Numbers below
          will be empty until KV is connected.
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-zinc-500">This month&apos;s generations</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">{report.currentMonth.generations}</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-zinc-500">Tokens this month</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">
            {(report.currentMonth.inputTokens + report.currentMonth.outputTokens).toLocaleString()}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-zinc-500">Estimated cost this month</CardTitle>
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
            <thead className="text-left text-zinc-500">
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
                  <td colSpan={4} className="py-3 text-zinc-500">
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
                <span className="text-zinc-500">
                  {u.generations} · {formatUsd(u.estimatedCostUsd)}
                </span>
              </div>
            ))}
            {report.byUser.length === 0 && <p className="text-zinc-500">No data yet.</p>}
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
                <span className="text-zinc-500">
                  {c.generations} · {formatUsd(c.estimatedCostUsd)}
                </span>
              </div>
            ))}
            {report.byClient.length === 0 && <p className="text-zinc-500">No data yet.</p>}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
