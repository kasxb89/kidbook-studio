import type { LibraryBook, LibrarySeries } from "@/types/library";
import { SANZIJING_BOOKS } from "./sanzijing";
import phone from "../../../content-drafts/qinzi/ba-ba-de-shou-ji-xian-shui-yi-hui-er.json";
import goodbye from "../../../content-drafts/qinzi/men-kou-de-zai-jian-xiao-yi-shi.json";
import sibling from "../../../content-drafts/qinzi/mei-mei-lai-le-wo-hai-zai-zhe-li.json";
import pause from "../../../content-drafts/qinzi/wo-men-jia-de-zan-ting-shou-shi.json";
import promise from "../../../content-drafts/qinzi/na-ge-yue-ding-mei-you-zuo-dao.json";
import rope from "../../../content-drafts/qinzi/sheng-zi-shua-de-yi-sheng.json";
import basketball from "../../../content-drafts/qinzi/lan-qiu-dong-dong-hui-lai-le.json";
import bicycle from "../../../content-drafts/qinzi/xiao-che-lun-man-man-zhuan.json";
import swimming from "../../../content-drafts/qinzi/yong-chi-li-de-yi-xiao-duan.json";
import paperPlane from "../../../content-drafts/qinzi/zhi-fei-ji-fei-guo-lan-xian.json";

import comparison from "../../../content-drafts/qinzi/bu-he-biao-ge-bi-kuai.json";
import photoPermission from "../../../content-drafts/qinzi/zhe-zhang-zhao-pian-xian-wen-wen-wo.json";
import cardboard from "../../../content-drafts/qinzi/wo-de-zhi-xiang-ming-tian-zai-chai.json";
import harmonica from "../../../content-drafts/qinzi/ba-ba-ye-you-bu-hui-de-shi-hou.json";
import grandfather from "../../../content-drafts/qinzi/wai-gong-zou-de-man-yi-dian.json";
import shoelace from "../../../content-drafts/qinzi/xie-dai-rao-guo-xiao-shan-qiu.json";
import chopsticks from "../../../content-drafts/qinzi/kuai-zi-jia-zhu-xiao-tuan-zi.json";
import scissors from "../../../content-drafts/qinzi/jian-dao-yan-zhe-xiao-lu-zou.json";
import beans from "../../../content-drafts/qinzi/hua-pen-li-de-yi-ke-dou.json";
import kite from "../../../content-drafts/qinzi/feng-zheng-deng-yi-zhen-feng.json";

type GrowthDraft = {
  book: Omit<LibraryBook, "pages"> & {
    pages: Array<Pick<LibraryBook["pages"][number], "page" | "zhText" | "enText" | "illustrationPrompt"> & {
      imageStatus?: "complete" | "pending";
      generationPrompt?: string;
    }>;
  };
};

const GROWTH_BOOKS: LibraryBook[] = [
  phone, goodbye, sibling, pause, promise, rope, basketball, bicycle, swimming, paperPlane,
  comparison, photoPermission, cardboard, harmonica, grandfather, shoelace, chopsticks, scissors, beans, kite,
].filter(({ book }) => !book.comingSoon).map((source) => {
  const { book } = source as GrowthDraft;
  return {
    ...book,
    pages: book.pages.map((page) => ({
      page: page.page,
      zhText: page.zhText,
      enText: page.enText,
      illustrationPrompt: page.generationPrompt ?? page.illustrationPrompt,
      imageStatus: page.imageStatus ?? "pending",
      imageUrl: page.imageStatus === "complete" ? `/library/sanzijing/${book.id}/${page.page}.webp` : undefined,
    })),
  };
});

export const QINZI_BOOKS: LibraryBook[] = [...SANZIJING_BOOKS, ...GROWTH_BOOKS];

export const QINZI_SERIES: LibrarySeries = {
  // Keep the historical slug so reading records, favorites and audio remain valid.
  id: "sanzijing",
  title: "亲子成长",
  subtitle: "在故事里练习爱、尊重与成长",
  description:
    "面向 4–8 岁家庭的亲子成长故事，包含三字经、亲子相处和学会新本领。陪孩子认识情绪、理解关系，也在运动、动手创作、生活练习和种植观察中慢慢掌握技能；每本提供双语正文、中文旁白与温和的共读锦囊。",
  accent: "#8b5a3c",
  ageRange: "4–8 岁",
  bookCount: QINZI_BOOKS.filter((book) => !book.comingSoon).length,
};
