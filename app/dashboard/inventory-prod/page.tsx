import { Factory } from "lucide-react"
import { ComingSoon } from "@/components/coming-soon"

export default function InventoryProdPage() {
  return (
    <ComingSoon
      title="생산품 재고"
      description="생산품별 현재 재고 수량을 확인하고 관리합니다"
      icon={Factory}
    />
  )
}
