// 야외봄 이름과 커스텀 봄 마크를 하나의 접근 가능한 워드마크로 표시한다.
import { publicPath } from "@/lib/public-path";

export function FamilyWordmark() {
  return (
    <strong className="family-wordmark" aria-label="야외봄">
      <span className="family-wordmark-prefix" aria-hidden="true">야외</span>
      <img className="family-bom" src={publicPath("/bom-outbom.svg")} alt="" aria-hidden="true" />
    </strong>
  );
}
