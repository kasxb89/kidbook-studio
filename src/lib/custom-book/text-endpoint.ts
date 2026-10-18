import "server-only";
type Provider = "cpa" | "agnes" | "bailian";
export function getStoryTextEndpoint(allowed?:Provider[]) {
  const selected=process.env.STORY_TEXT_PROVIDER;
  let provider:Provider=selected==="agnes"||selected==="bailian"?selected:"cpa";
  if(allowed&&!allowed.includes(provider))provider="cpa";
  const dedicatedKey=process.env.CUSTOM_BOOK_TEXT_API_KEY?.trim();
  const dedicatedUrl=process.env.CUSTOM_BOOK_TEXT_BASE_URL?.trim();
  if(dedicatedKey||dedicatedUrl) {
    return dedicatedKey&&dedicatedUrl?{provider:"cpa" as const,baseUrl:dedicatedUrl.replace(/\/+$/,""),apiKey:dedicatedKey}:null;
  }
  const apiKey=(provider==="agnes"?process.env.AGNES_API_KEY?.split(",")[0]:provider==="bailian"?process.env.BAILIAN_TOKEN_KEY:process.env.CPA_API_KEY)?.trim();
  const url=provider==="agnes"?"https://apihub.agnes-ai.com/v1":provider==="bailian"?(process.env.BAILIAN_TEXT_BASE_URL||"https://token-plan.cn-beijing.maas.aliyuncs.com/compatible-mode/v1"):process.env.CPA_BASE_URL;
  return apiKey&&url?{provider,baseUrl:url.trim().replace(/\/+$/,""),apiKey}:null;
}
