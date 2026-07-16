// 야외봄 이름과 커스텀 봄 마크를 하나의 접근 가능한 워드마크로 표시한다.
import Image from "next/image";
import familyBom from "@/src/generated/robom-family/wordmark.svg";

export function FamilyWordmark() {
  return (
    <strong className="family-wordmark">
      <span className="sr-only">야외봄</span>
      <span className="family-wordmark-prefix" aria-hidden="true">야외</span>
      <Image className="family-bom" src={familyBom} alt="" aria-hidden="true" priority />
    </strong>
  );
}
