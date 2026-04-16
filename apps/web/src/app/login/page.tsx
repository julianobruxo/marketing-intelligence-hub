import Link from "next/link";
import { ShieldCheck, Workflow } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,_rgba(14,165,233,0.18),_transparent_35%),linear-gradient(180deg,#f8fbff_0%,#eef4fb_100%)] px-6 py-16">
      <Card className="w-full max-w-3xl border-slate-200 bg-white/95 shadow-xl shadow-slate-300/20">
        <CardHeader className="space-y-5">
          <Badge className="w-fit rounded-full bg-sky-600 px-3 py-1 text-white hover:bg-sky-600">
            Marketing Intelligence Hub
          </Badge>
          <div className="space-y-3">
            <CardTitle className="text-4xl font-semibold tracking-tight text-slate-950">
              Protected internal workflow for Pipeline #1
            </CardTitle>
            <CardDescription className="max-w-2xl text-base leading-7 text-slate-600">
              This platform is designed for the Zazmic content operations workflow:
              Google Sheets to Zapier or n8n, then into the internal platform, Canva, and
              manual or future API-driven LinkedIn publishing.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <Card className="border-slate-200 bg-slate-50/80 shadow-none">
            <CardHeader>
              <ShieldCheck className="h-5 w-5 text-sky-700" />
              <CardTitle className="text-lg text-slate-900">Access model</CardTitle>
            </CardHeader>
            <CardContent className="text-sm leading-6 text-slate-600">
              Production access will be enforced through Google Cloud IAP and restricted to
              <code>@zazmic.com</code> identities, with app-level roles layered on top.
            </CardContent>
          </Card>
          <Card className="border-slate-200 bg-slate-50/80 shadow-none">
            <CardHeader>
              <Workflow className="h-5 w-5 text-sky-700" />
              <CardTitle className="text-lg text-slate-900">Local development</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm leading-6 text-slate-600">
              <p>
                Set <code>DEV_AUTH_EMAIL</code> to a <code>@zazmic.com</code> address in{" "}
                <code>apps/web/.env</code> to access protected routes locally.
              </p>
              <Link href="/queue" className="font-medium text-sky-700 underline underline-offset-4">
                Go to queue
              </Link>
            </CardContent>
          </Card>
        </CardContent>
      </Card>
    </main>
  );
}
