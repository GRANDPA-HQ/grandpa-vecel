import { Archive } from "lucide-react"
import { ComingSoon } from "@/components/coming-soon"

export default function InventorySubmatPage() {
  return (
    <ComingSoon
      title="포장 부자재 재고"
      description="포장 부자재별 현재 재고 수량을 확인하고 관리합니다"
      icon={Archive}
    />
  )
}
