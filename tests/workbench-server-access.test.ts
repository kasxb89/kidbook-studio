import { describe,it,expect } from "vitest";
import { workbenchRequestError } from "@/lib/workbench-access";
const env={STORYBLOOM_WORKBENCH_ORIGIN:"https://books.example",STORYBLOOM_WORKBENCH_USERNAME:"test-account",STORYBLOOM_WORKBENCH_PASSWORD_HASH:`scrypt:${"00".repeat(16)}:${"00".repeat(64)}`};
function request(headers:Record<string,string>={}) {return new Request("http://127.0.0.1:3100/api/local/projects",{headers:{host:"books.example",origin:"https://books.example",...headers}});}
describe("explicit private server workbench",()=>{
  it("keeps local mode login-free and refuses remote hosts by default",()=>{
    expect(workbenchRequestError(new Request("http://127.0.0.1:3100/api/local/projects"),{})).toBeNull();
    expect(workbenchRequestError(request(),{})).toMatchObject({status:403});
  });
  it("supports a reverse proxy while requiring the configured host, secret and browser origin",()=>{
    expect(workbenchRequestError(request(),env)).toBeNull();
    expect(workbenchRequestError(request({host:"other.example","x-forwarded-host":"books.example"}),env)).toMatchObject({status:403});
    expect(workbenchRequestError(request({origin:"https://evil.example"}),env)).toMatchObject({status:403});
    expect(workbenchRequestError(request({"sec-fetch-site":"cross-site"}),env)).toMatchObject({status:403});
  });
  it("refuses incomplete deployment credentials and invalid origins",()=>{
    expect(workbenchRequestError(request(),{...env,STORYBLOOM_WORKBENCH_PASSWORD_HASH:""})).toMatchObject({status:503});
    expect(workbenchRequestError(request(),{...env,STORYBLOOM_WORKBENCH_ORIGIN:"https://books.example/private"})).toMatchObject({status:503});
  });
});
