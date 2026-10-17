import JsonLd from "@/components/seo/JsonLd";
import { localizedPath, type SiteLocale } from "@/lib/seo";
import { toAbsoluteAppUrl } from "@/lib/site-url";

export default function HomeStructuredData({ locale = "zh" }: { locale?: SiteLocale }) {
  const organization = { "@type": "Organization", "@id": toAbsoluteAppUrl("/#organization"), name: "StoryBloom", url: toAbsoluteAppUrl("/"), logo: toAbsoluteAppUrl("/icons/icon-512.png") };
  const url = toAbsoluteAppUrl(localizedPath("/", locale));
  return <JsonLd data={{ "@context": "https://schema.org", "@graph": [
    organization,
    { "@type": "WebSite", "@id": `${url}#website`, name: "StoryBloom", url, inLanguage: locale === "en" ? "en" : "zh-CN", publisher: { "@id": organization["@id"] } },
    { "@type": "WebApplication", name: "StoryBloom", url, applicationCategory: "EducationalApplication", operatingSystem: "Web", inLanguage: ["zh-CN", "en"], description: locale === "en" ? "AI storybook creation and bilingual picture books for family reading." : "AI 儿童绘本生成与中英双语亲子共读。", publisher: { "@id": organization["@id"] } },
  ] }} />;
}
