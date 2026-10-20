import { NextResponse, type NextRequest } from "next/server";
import { workbenchRequestError, workbenchLoginEnabled } from "./src/lib/workbench-access";

export function middleware(request:NextRequest) {
  if(!workbenchLoginEnabled())return NextResponse.next();
  const error=workbenchRequestError(request,process.env,request.nextUrl.pathname.startsWith("/api/"));
  if(!error)return NextResponse.next();
  const options={status:error.status,headers:{"Cache-Control":"no-store"}};
  return request.nextUrl.pathname.startsWith("/api/")?NextResponse.json({error:error.message},options):new NextResponse(error.message,options);
}
export const config={matcher:["/custom/:path*","/studio-login","/api/local/:path*"]};
