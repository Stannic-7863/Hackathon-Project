"use client";

import dynamic from "next/dynamic";

const UoLAssistant = dynamic(() => import("@/components/uol-assistant"), {
  ssr: false,
  loading: () => (
    <div className="flex h-screen items-center justify-center bg-slate-50 text-sm text-slate-400">
      Loading...
    </div>
  ),
});

export default function Page() {
  return <UoLAssistant />;
}
