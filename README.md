# KidBook Studio

本地 AI 儿童绘本创作工作台，面向内部制作人员。上传人物参考照片、讲述经历，由 AI 起草创作设定和分镜，逐页编辑后导出可制作成册的文件。

基于 [StoryBloom](https://github.com/valleylmh/storybloom) 二次开发，保留上游历史和 MIT 许可。

## 当前能力

- **三个领域、60 个分场景**：养成好习惯、孩子真实经历改编、认知启蒙（识图 / 识物 / 识字），各 20 个常用场景。
- **AI 辅助填写**：根据孩子称呼和简述起草书名、目标与人物设定。真实经历需要人工核对事实后再生成。
- **1–200 页正文**：封面另计；长书先规划全书节奏，再分批生成分镜，支持中断恢复。
- **四个工作区**：创作设定、故事分镜、单页画布、印刷交付。
- **页面编辑与版本**：正文、场景、裁剪、排版、审核状态；每页最多保留 32 个图片版本，可对比和恢复。
- **人物风格与文字样式**：真人写实 / 动漫绘本统一控制生成；黑体 / 手写楷体、字号、颜色、文字底色及不透明度实时预览，可应用到整本并保存。
- **文字自由排版**：拖动文字框、方向键微调及调整宽度；位置可刷新恢复并带入 PDF。
- **独立 AI 一键成书**：独立页面一次填写领域、场景、称呼、年龄、页数和故事，上传照片并选择画风。自动整理设定、编写分镜、生成封面与全部内页，保存为新项目。输入与制作进度保存在本机，刷新自动恢复；接口失败时保留成果，可从中断处继续。手动制作保留分镜审核流程。
- **可编辑的中文编导工作台**：生成后直接展示完整故事梗概、起承转合、全书节拍、人物与美术方案；逐页显示正文、景别、动作、表情、构图、文字位置和完整场景提示词。方案随阶段保存并用于后续生成，可下载整本中文编导稿；长绘本按页段浏览。制作中可在当前步骤完成后暂停，修改故事线、人物、美术和逐页编导，保存后从下一张继续；完成后仍可改稿，已有图片需在画布重新生成。修改草稿刷新可恢复，保存同时更新本机项目和制作任务。
- **按书名归档与自动保存**：每本绘本独立一个文件夹，自动整理编导稿、项目配置、逐页图片和人物参考；PDF 与交付包导出后自动归档，旧图和旧版成品保留在历史版本。顶部“打开本书文件夹”直接定位当前书，支持查看和复制路径。同名书自动区分，改书名时保留已有文件。SQLite 继续提供工作区与编辑结果的刷新恢复。
- **A4 印刷导出**：印厂版和办公版、自选装订、出血、镜像内侧留白、有效 300 ppi 检查、PDF 和制作交付包。骑马订办公交付包提供 A3 双面拼版。

当前本地工作流不需要 Supabase、登录、兑换码或生成额度。

## 本地启动

需要 pnpm 和支持 `node:sqlite` 的 Node.js；当前项目已在 Node.js **25.8.2** 下验证。

```sh
git clone https://github.com/kasxb89/kidbook-studio.git
cd kidbook-studio
pnpm install --frozen-lockfile
cp .env.example .env.local
pnpm dev:local
```

打开 [本地工作台](http://127.0.0.1:3100/custom)。开发服务仅监听 `127.0.0.1:3100`，适合本机内部使用。

## 模型配置

在 `.env.local` 中填写，密钥只供服务端读取：

```dotenv
CUSTOM_BOOK_TEXT_BASE_URL=https://your-text-api.example/v1
CUSTOM_BOOK_TEXT_API_KEY=
CUSTOM_BOOK_TEXT_MODEL=your-text-model

CUSTOM_BOOK_IMAGE_BASE_URL=https://your-image-api.example/v1
CUSTOM_BOOK_IMAGE_API_KEY=
CUSTOM_BOOK_IMAGE_MODEL=gpt-image-2
```

将示例地址和文本模型名换成实际接口提供的值，并填写自己的密钥。文本接口使用兼容 `/chat/completions` 的协议；已适配 ToAPIs 的 `gpt-image-2` 异步生图与任务恢复。其他生图端点需要符合现有兼容协议。

没有配置模型时可以手动编辑、上传已有插图和保存项目；不会生成假成品。项目数据保存在本机，调用外部模型时，相关文字和参考照片会发送到所配置的服务商。

## 数据与交付

默认数据目录为 `.local-data/`，包含 `storybloom.sqlite` 与 `assets/`。也可通过 `STORYBLOOM_LOCAL_DATA_DIR` 指定目录。

面向制作人员的文件整理在 `.local-data/绘本/<书名>/`：`编导稿.txt`、`项目配置.json`、`图片/`、`成品PDF/`、`交付包/`。编导稿和图片随项目及生成进度更新；PDF 在导出时归档。更改内容后，界面会提示重新导出成品；历史版本不会覆盖当前文件。内部原图继续保留，书名文件夹里的副本与原图相互独立。

备份时等待“已保存到本机”，停止工作台服务，再复制整个数据目录。只导出项目 JSON 不包含图片，不能代替完整备份。

`.env.local`、本机数据库、客户照片、生成绘本、印刷文件和本机验收资料均不上传 Git。新电脑需要自行配置模型，并通过数据目录备份迁移项目。

详细使用方法见 [本地工作台说明](docs/local-workbench.md)。

## 开发验证

```sh
pnpm exec tsc --noEmit
pnpm exec vitest run tests/book-studio.test.ts tests/local-recovery.test.ts tests/local-workbench.test.ts tests/prepare-book.test.ts tests/custom-workbench.test.ts tests/print-book.test.ts --fileParallelism=false --maxWorkers=1
```

真实模型连通测试默认跳过，常规测试不需要密钥或付费调用。开发期间不默认运行生产构建，避免与正在使用的开发服务共用 `.next` 输出。

## 来源与许可

应用代码采用 [MIT License](LICENSE)，保留 StoryBloom 原版权声明。印刷字体 Noto Sans SC 的许可证见 [OFL.txt](public/fonts/print/OFL.txt)；霞鹜文楷来自 [LXGW WenKai](https://github.com/lxgw/LxgwWenKai)，许可证见 [LXGWWenKai-OFL.txt](public/fonts/print/LXGWWenKai-OFL.txt)。上游遗留的公开绘本馆、小程序、视频与云端功能代码仍在仓库中；本地工作台的使用入口为 `/custom`。视频相关依赖 Remotion 的许可见其 [许可证](https://www.remotion.dev/docs/license)。
