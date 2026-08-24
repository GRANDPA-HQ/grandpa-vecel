import { Wheat } from "lucide-react"
import { ComingSoon } from "@/components/coming-soon"

export default function InventoryRawPage() {
  return (
    <ComingSoon
      title="원재료 재고"
      description="원재료별 현재 재고 수량을 확인하고 관리합니다"
      icon={Wheat}
    />
  )
}
