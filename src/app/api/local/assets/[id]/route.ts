import { readAsset } from "@/lib/local/store";
import { assertLocalRequest, localError } from "@/lib/local/http";
export const runtime="nodejs";
export async function GET(request:Request,c:{params:Promise<{id:string}>}) {try {
  assertLocalRequest(request);return new Response(new Uint8Array(readAsset((await c.params).id)),{headers:{"Content-Type":"image/jpeg","Cache-Control":"private, max-age=31536000, immutable","X-Content-Type-Options":"nosniff","Cross-Origin-Resource-Policy":"same-origin"}});
}catch(e){return localError(e);}}
