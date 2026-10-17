import HomeExperience from "@/components/home/HomeExperience";
import HomeIntroduction from "@/components/home/HomeIntroduction";
import HomeStructuredData from "@/components/home/HomeStructuredData";
import { HOME_TITLES, pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  path: "/", title: HOME_TITLES.en, locale: "en", bilingual: true,
  description: "Create illustrated stories from your child's everyday moments with AI. Read free Chinese and English picture books, Chinese idiom stories for kids, poems and bedtime stories together.",
});

export default function EnglishHomePage() {
  return <>
    <HomeStructuredData locale="en" />
    <HomeExperience key="en" initialLocale="en"><HomeIntroduction locale="en" /></HomeExperience>
  </>;
}
