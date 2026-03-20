import { Suspense } from "react"
import DashboardClient from "../../src/components/dashboard/DashboardClient"

export default function DashboardPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#0a0a0f]" />}>
      <DashboardClient />
    </Suspense>
  )
}
