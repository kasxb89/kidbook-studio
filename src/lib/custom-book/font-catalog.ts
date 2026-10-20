// Self-hosted fonts: the browser and PDF renderer use the same font files.
// Sources and full redistribution licenses live in public/fonts/print/.
export const BOOK_FONTS = {
  sans: { label: "思源黑体 · 常规", family: '"KidBook Sans"', file: "NotoSansSC-Regular.otf", category: "黑体", weight: 400 },
  "sans-thin": { label: "思源黑体 · 纤细", family: '"KidBook Sans Thin"', file: "NotoSansSC-Thin.otf", category: "黑体", weight: 100 },
  "sans-light": { label: "思源黑体 · 细体", family: '"KidBook Sans Light"', file: "NotoSansSC-Light.otf", category: "黑体", weight: 300 },
  "sans-demilight": { label: "思源黑体 · 半细", family: '"KidBook Sans DemiLight"', file: "NotoSansSC-DemiLight.otf", category: "黑体", weight: 350 },
  "sans-medium": { label: "思源黑体 · 中黑", family: '"KidBook Sans Medium"', file: "NotoSansSC-Medium.otf", category: "黑体", weight: 500 },
  "sans-bold": { label: "思源黑体 · 粗体", family: '"KidBook Sans Bold"', file: "NotoSansSC-Bold.otf", category: "黑体", weight: 700 },
  "sans-black": { label: "思源黑体 · 特粗", family: '"KidBook Sans Black"', file: "NotoSansSC-Black.otf", category: "黑体", weight: 900 },
  serif: { label: "思源宋体 · 常规", family: '"KidBook Serif"', file: "NotoSerifSC-Regular.otf", category: "宋体", weight: 400 },
  "serif-extralight": { label: "思源宋体 · 纤细", family: '"KidBook Serif ExtraLight"', file: "NotoSerifSC-ExtraLight.otf", category: "宋体", weight: 200 },
  "serif-light": { label: "思源宋体 · 细体", family: '"KidBook Serif Light"', file: "NotoSerifSC-Light.otf", category: "宋体", weight: 300 },
  "serif-medium": { label: "思源宋体 · 中粗", family: '"KidBook Serif Medium"', file: "NotoSerifSC-Medium.otf", category: "宋体", weight: 500 },
  "serif-semibold": { label: "思源宋体 · 半粗", family: '"KidBook Serif SemiBold"', file: "NotoSerifSC-SemiBold.otf", category: "宋体", weight: 600 },
  "serif-bold": { label: "思源宋体 · 粗体", family: '"KidBook Serif Bold"', file: "NotoSerifSC-Bold.otf", category: "宋体", weight: 700 },
  "serif-black": { label: "思源宋体 · 特粗", family: '"KidBook Serif Black"', file: "NotoSerifSC-Black.otf", category: "宋体", weight: 900 },
  kai: { label: "霞鹜文楷 · 常规", family: '"KidBook Kai"', file: "LXGWWenKai-Regular.ttf", category: "楷体手写", weight: 400 },
  "kai-light": { label: "霞鹜文楷 · 细体", family: '"KidBook Kai Light"', file: "LXGWWenKai-Light.ttf", category: "楷体手写", weight: 300 },
  "kai-medium": { label: "霞鹜文楷 · 中粗", family: '"KidBook Kai Medium"', file: "LXGWWenKai-Medium.ttf", category: "楷体手写", weight: 500 },
  kuaile: { label: "站酷快乐体", family: '"KidBook KuaiLe"', file: "ZCOOLKuaiLe-Regular.ttf", category: "童趣标题", weight: 400 },
  xiaowei: { label: "站酷小薇体", family: '"KidBook XiaoWei"', file: "ZCOOLXiaoWei-Regular.ttf", category: "童趣标题", weight: 400 },
  huangyou: { label: "站酷庆科黄油体", family: '"KidBook HuangYou"', file: "ZCOOLQingKeHuangYou-Regular.ttf", category: "童趣标题", weight: 400 },
  brush: { label: "马善政毛笔楷书", family: '"KidBook Brush"', file: "MaShanZheng-Regular.ttf", category: "书法标题", weight: 400 },
  longcang: { label: "龙藏手书", family: '"KidBook LongCang"', file: "LongCang-Regular.ttf", category: "书法标题", weight: 400 },
  liujian: { label: "刘建毛草", family: '"KidBook LiuJian"', file: "LiuJianMaoCao-Regular.ttf", category: "书法标题", weight: 400 },
  zhimang: { label: "志莽行书", family: '"KidBook ZhiMang"', file: "ZhiMangXing-Regular.ttf", category: "书法标题", weight: 400 },
} as const;
export type BookFont = keyof typeof BOOK_FONTS;
export const BOOK_FONT_IDS = Object.keys(BOOK_FONTS) as [BookFont, ...BookFont[]];
export const FONT_CATEGORIES = ["黑体", "宋体", "楷体手写", "童趣标题", "书法标题"] as const;
