import { pageMetadata } from "@/lib/seo";
import { QICHE_BOOKS } from "@/lib/library/qiche";
import CityMotorsGift from "@/components/gifts/CityMotorsGift";
import type { GiftPage } from "@/components/gifts/GiftReader";
export const metadata = pageMetadata({
  path: "/gifts/city-motors",
  title: "城市汽车小队 · 全集典藏版 | StoryBloom 礼物绘本",
  description: "跟着安安探索城市交通与工程的小秘密，把汽车科普故事珍藏成一本礼物绘本。",
  image: "/library/qiche/hong-lu-deng-wei-shen-me-hui-bian-se/1.webp",
});
export default function Page(){
  const pages: GiftPage[] = [
    {page:1,imageUrl:"/gift-books/city-motors/opening.png",half:"left",text:"早安，城市！跟着安安，一起出发。"},
    {page:2,imageUrl:"/gift-books/city-motors/opening.png",half:"right",text:"每一辆车，都有自己的本领。每一次合作，都让城市更美好。"},
  ];
  const chapters = [{title:"序 · 早安，城市",pageIndex:0}];
  QICHE_BOOKS.forEach((book,index)=>{
    chapters.push({title:`${String(index+1).padStart(2,"0")} · ${book.title}`,pageIndex:pages.length});
    book.pages.forEach(page=>pages.push({page:pages.length+1,imageUrl:page.imageUrl!,text:page.zhText,chapter:book.title}));
  });
  return <div data-gift-module><CityMotorsGift pages={pages} chapters={chapters}/></div>;
}
