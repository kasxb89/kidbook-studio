# 内部服务器工作空间

工作台同时支持本机和内部服务器。服务器模式是一个共享的制作工作空间，不依赖 Supabase、兑换码或生成额度。配置账号后，本机和服务器均使用独立的工作台登录页。

## 配置与启动

使用带 `node:sqlite` 的 Node.js，保留整份 `public/`，尤其是 `public/fonts/print/`。安装依赖后构建、运行 Next 的 Node 服务；此工作流使用持久化磁盘和 SQLite，不适合直接改成无磁盘的边缘函数。

服务器环境变量示例：

```dotenv
STORYBLOOM_WORKBENCH_ORIGIN=https://books.example.com
STORYBLOOM_WORKBENCH_USERNAME=your-account
STORYBLOOM_WORKBENCH_PASSWORD_HASH=scrypt:replace-with-generated-salt:replace-with-generated-hash
STORYBLOOM_LOCAL_DATA_DIR=/srv/kidbook-data
```

`ORIGIN` 必须是完整站点来源（协议、域名、可选端口），不能带路径。运行 `node scripts/configure-workbench-login.mjs` 配置账号与密码，默认写入已被Git忽略的 `.env.local`，也可传入其它环境文件路径。脚本隐藏密码输入，仅保存带随机盐的 scrypt 哈希。不要把实际账号密码或哈希写入源码。

打开 `/custom`，未登录时跳转到 `/studio-login`。页面和所有 `/api/local/` 文件、模型、下载接口均受服务端会话保护；退出前保存修改，退出后旧会话立即失效。会话最长7天、连续12小时未操作失效，修改账号或密码使旧会话失效。Cookie为HttpOnly、SameSite=Lax，HTTPS下带Secure。登录有失败次数限制。

反向代理保留正确的 Host，使用 HTTPS，并覆盖 `X-Real-IP`。未配置来源时只接受 localhost；未配置有效账号与密码哈希时不开放服务器工作空间。完全不配置登录变量时可保留原有的本机免登录模式。

模型 URL 与 Key 继续只放在服务端环境中，不进入项目包。将示例域名和口令换成实际配置，不能把 `.env.local`、客户照片或数据库提交到仓库。

数据目录放在发布目录之外，并挂载持久化磁盘；更新代码时保留该目录。SQLite 工作空间使用单个 Node 实例，不能让多台服务器同时写同一数据库文件。若使用 Next standalone 输出，需要同时拷贝 `public/` 和 `.next/static/`。

反向代理需允许大文件上传和流式下载。例如Nginx对应的站点配置中，设置 `client_max_body_size 512m`、`proxy_read_timeout 300s`，并为工作台请求关闭 `proxy_buffering`。代理的 `Host` 使用 `$http_host`，`X-Forwarded-Proto` 使用 `$scheme`。入口为 `/custom`，可将根路径重定向到该入口。

此文档为部署准备，不会自动部署或修改服务器。

## 独立容器部署

构建脚本仅为 `next build`；`Dockerfile.workbench` 使用独立构建目录，不触碰本机开发服务，`.dockerignore` 排除客户数据、环境密钥和本机产物。示例：

```sh
docker build -f Dockerfile.workbench -t kidbook-studio:RELEASE .
docker run -d --name kidbook-studio --restart unless-stopped \
  --memory 1536m --cpus 1.5 --pids-limit 256 \
  -p 127.0.0.1:3101:3101 \
  --env-file /opt/kidbook-studio/shared/workbench.env \
  -v /opt/kidbook-studio/shared/data:/data \
  --security-opt no-new-privileges:true --cap-drop ALL \
  kidbook-studio:RELEASE
```

宿主数据目录属主设置为镜像的node用户UID1000。环境文件仅管理员可读，数据目录不可由公网静态访问。容器以非root用户运行；模型参数仅运行时载入。更新时保留数据卷、环境文件和旧镜像，准备好新镜像、确认数据备份后再切换本容器。

同一IP与 harnes-api 共用443时，将 `deploy/kidbook-proxy.conf` 和 `deploy/kidbook-nginx.conf` 放入 `/etc/nginx/snippets/`，只在现有HTTPS server块新增一行include。先核对这些专用路径未被其他业务占用，再执行nginx配置检查和reload；不重启任何原有业务容器。入口为 `/kidbook` 或 `/custom`，不会代理其它旧版家庭平台API。保留原Nginx文件及其SHA256，失败只撤回本次include和本应用。

## 文件与下载

- 页面顶部“文件与下载”：按书名查看编导稿、配置、已生成PDF和交付包，可重复下载。
- “下载整本交付资料”：当前编导稿、图片与已导出的PDF。
- “下载全部原图”：逐页插图及人物参考，不把画布截图当作原图。
- “下载完整项目备份”：原图、可编辑配置、逐页文字样式、分镜、图片版本历史及已导出PDF。
- “导入项目备份”：将完整备份ZIP导入为新项目，重新分配素材ID，保留已有项目。导入上限512MB（压缩前后均受限）。
- 单页画布可下载带文字及背景效果的高分辨率PNG；印刷以PDF及原图检查结果为准。

服务器上不提供“打开Finder”操作。文件通过浏览器下载到操作者自己的电脑，进度和保存位置由浏览器管理。PDF及归档文件通过原生下载接口传输，支持中文文件名和 HTTP Range；整本资料ZIP按流输出，避免把所有图片一次装入浏览器内存。

本机模式保留“打开本书文件夹”和复制本机路径，同时具备上述下载功能。

自动保存与刷新恢复继续生效。下载备份前会先提交当前修改；已导出PDF不会随编辑自动重制，界面会提示需要重新导出。

## 字体与排版

内置24种中文字体样式（含字重）：思源黑体7种、思源宋体7种、霞鹜文楷3种，以及站酷快乐体、小薇体、庆科黄油体、马善政毛笔楷书、龙藏手书、刘建毛草、志莽行书。字体随项目提供，按需加载；切换电脑无需安装系统字体或依赖外部字体CDN。

常用控制放在面板前部，高级控制按用途折叠：字号8–180、48色预设与任意十六进制颜色、斜体、下划线、字距、行距、透明度、笔画加粗、描边、偏移阴影、底色、背景透明度、背景留白、圆角、边框、精确位置、宽度、旋转、重点词独立颜色与字号倍率。数值支持小数。

画布和印刷PDF分别使用同一字体文件，PDF嵌入字体并保留矢量文字。装饰字体不包含的字符会回退到思源黑体，避免孩子名字中的生僻字丢失；若回退字体也缺字，印刷检查会阻止导出并指出缺失字符。

字体来源、大小和SHA-256记录在 `public/fonts/print/font-sources.json`；原始许可证随字体保留。补齐内置字体可运行 `python3 scripts/install-book-fonts.py`，已存在的字体文件保持不变。

字体源为官方 [Noto CJK](https://github.com/notofonts/noto-cjk)、[霞鹜文楷](https://github.com/lxgw/LxgwWenKai) 和 [Google Fonts](https://github.com/google/fonts)。应用代码的MIT许可不替代字体目录中的各份OFL许可。
