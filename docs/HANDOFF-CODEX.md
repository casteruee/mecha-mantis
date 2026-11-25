> 2026-11-17 更新：当前状态与验收规则以 [CURRENT-SPEC.md](CURRENT-SPEC.md) 和 [R8 记录](rounds/r8/score.md) 为准。以下历史内容保留备查；R7 已作废，R8 为待评审候选。

# 项目交接说明 —— ORCHIS MX-7 机械螳螂(交 Codex 接手建模调整)

> 交接时间:2026-11-17。前序助手完成的部分影片与建模迭代后,用户判定建模与设计图差距仍大
> (尤其头部),r7 轮已作废(`rounds/r7_void/`)。**本阶段唯一任务:把建模调到贴近设计图。**
> 暂时不要做视频(影片管线已就绪,建模定稿后重渲即可)。

---

## 1. 项目目的与起因

X 博主 **@Nyxera0x** 发布了"3D Simulator"系列四条视频(机械蜘蛛 / 食人鱼 / 章鱼 / 黄蜂):
一张 AI 生成的参考图 → 全程写代码用 three.js 建出机械生物(不导入任何模型/贴图/图片)→
对照参考图逐条打分迭代静帧 → 静帧通过后拍成"产品拆解"短片(网页仪表盘 + 部件拆解 + 整机爆炸 + 收尾出击)。

- 原帖长文:`https://x.com/nyxera0x/status/2118689860437315679`(《How I Turn One Image Into a 3D Simulator That Takes Itself Apart》)
- 作者开源的方法包:**github.com/nyxera0x/cutaway**(已克隆在 `ref-cutaway/`,MIT 协议;
  内含 JOB_DESCRIPTION / CHECKLIST / PROMPTS 等方法文档和 3 个示例动物的代码)

**本项目 = 仿照他的设计思路做一只"螳螂版本"**:产品名 **ORCHIS MX-7**,主视觉是白亮壳 + 洋红点缀
(镰刀尖、板边线、发光线圈)+ 密集深色机械,配套同款节奏的拆解影片。项目里的
`job-description.md` 就是我们按他的方法写的"岗位说明书"(建模 brief + 历轮纠正记录),
`checklist-mantis.md` 是验收清单,`storyboard-v1.md` 是 12 秒分镜。

## 2. 建模的唯一标准:五张设计图(项目根目录)

| 文件 | 内容 | 用途 |
|---|---|---|
| `hero.png` | 英雄 3/4 视角全身(前臂举起) | **主标准**:整体比例、姿态、光感 |
| `ref-front.png` | 正面全身 | 对称性、腹部截面、腿距 |
| `ref-head-macro.png` | 头部特写 | 头形/眼睛/天线/下巴的细节标准 |
| `ref-forearm-macro.png` | 镰刀前臂特写 | 股节玻璃壳/弹簧/刺/镰刀 |
| `ref-abdomen-macro.png` | 腹部特写 | 玻璃板/白环/发光线圈/金属尾锥 |

另有参考视频 4 条:`ref-video/*.mp4`(桌面也有副本,16:9、60fps、10s),节奏分析在
`ref-video/analysis/ref-analysis.md`;**视频只定节奏和版式,建模以五张图为准**。

## 3. 规范文档(动手前必读,按这个优先级)

1. **`job-description.md`** —— 建模 brief(外观规则/构建顺序/镜头规则/影片规则)+
   **历轮纠正记录(第 2/3/4/5 轮后,全部带数字)**+ 工作方法纠正。数字约束(比例、厚度、颜色、机位)都在这里。
2. **`checklist-mantis.md`** —— 12 条逐条验收(是/部分/否)+ 实测比例表(占体长 L 的比例)。
3. `storyboard-v1.md` —— 分镜。**注意**:其中"竖屏 1080×1920"的口径在执行中已被用户改为
   **16:9 横屏**(跟随四条参考视频),影片实际按 16:9 做;分镜的节拍表也被参考实测修正过
   (部件拆解开 0.9s / 悬停 0.65–0.75s / 合 0.5s,不是原文的 1.0/1.2/0.5)。

## 4. 工具链与常用命令(全部已就绪)

```bash
# 静帧(1600×900):hero 自动取景 / 三张特写 / mask
node tools/render.mjs out.png "t=0"                 # 英雄静帧(姿态对齐 hero.png)
node tools/render.mjs out.png "shot=head&t=0"       # 头部特写(另有 shot=forearm / shot=abdomen)
node tools/render.mjs out.png "t=0&mask"            # 身体 mask(走路腿+天线为黑,供密度指标)

# 参考|现状并排对比图(带量化指标,900px 密度口径)—— 交付的核心形式
node tools/sheet.mjs out.png "hero.png|参考 hero" "ours.png|第 N 轮 英雄静帧"

# 指标:身体暗像素 / 边缘密度 / 最大纯黑块
python -I tools/measure.py measure img.png

# 其他:tools/fitcam.py(从 hero.png 反求相机)、tools/headtrace.py(网格描点/描摹线)
# 影片(建模定稿后才用):tools/vcapture.mjs(film|stills|eval)、tools/makesfx.py
```

- 环境:Windows 11;Chrome 在 `C:/Program Files/Google/Chrome/Application/chrome.exe`;
  ffmpeg 在 PATH;Python 3.12(有 numpy/cv2/PIL);Node 22 + three.js(node_modules 已装)。
- Python 一律 `python -I tools/xxx.py`。
- **每轮交付到 `rounds/rN/`**:still.png(+mask)、macro_head/forearm/abdomen.png、
  compare*.png(四张对比图)、score.md(逐条打分)、mantis.js/main.js 代码快照。

## 5. 已完成的部分(背景,不是本阶段任务)

| 资产 | 内容 | 状态 |
|---|---|---|
| `web/mantis.js` | 全程序化螳螂(~900 行):头/胸/颈/翅/镰刀前臂/腿/可拆解腹部(7 白环×8 玻璃板、4 腹板、6 线圈模块、尾锥) | **建模主体,待继续调** |
| `web/main.js` + `index.html` | 静帧管线(hero 自动取景 + 三特写机位 + bokeh) | 可用 |
| `film/landscape.json` + `web/landscape.*` + `tools/vcapture.mjs` + `makesfx.py` | 12s 影片管线:开场→腹部拆解→爆炸(330°+慢动作+复位)→镰刀出击;JSON 驱动、render(t) 纯函数、合成配乐(-14 LUFS) | 完成,建模定稿后重渲 |
| `rounds/beat_abdomen_v0`、`film_v1`、`film_v2` | 影片各版输出(16:9,1920×1080,60fps) | 参考用 |
| `rounds/r1`–`r5` | 静帧迭代历史(纠正记录见 job-description) | 参考用 |
| `rounds/r6` | 腹部加粗(rx 1.15→1.62)/头壳 1.22→1.14/天线改 V 形/翅膀加宽 | 用户看过,头部不满意 |
| `rounds/r7_void` | 头部"描摹→放样重建"尝试 | **作废,勿在此基础上继续** |

## 6. 当前建模问题清单(交接重点)

用户对建模的核心不满(多轮未达标):

1. **头部形状** —— 与 ref-head-macro 差距大。已知差异:参考是"圆角三角盾"(上缘近直、下巴收尖),
   我们的偏圆球;眼睛应是嵌入式大椭圆(长轴≈0.76 头高、沿头缘上倾 ~35°、顶缘被轮廓切入),
   远侧眼只露黑圆顶;头部相对颈部前倾 ~35°;脸部应有小螺丝和板缝;天线从头顶两眼间长出、
   细丝、上抬外张 V 形、尖端不下钩。
2. **天线弯曲方向** —— 早期版本尖端下钩/侧卷过大,r6 已改 V 形但用户仍未最终认可。
3. **腹部直径** —— 早期纤细,r6 已加粗到 rx 1.62 / rz 1.28(蛋形),用户看过整体后仍要求
   "建模跟设计图差别还是比较大,很多细节对应不起来",要求系统性对齐。
4. 其他已知差距(job-description 与 score 中记录):前臂股节参考是长刀形壳(我们偏圆短)、
   头身比略小、腹部玻璃后暗机械密度偏低、腿比参考细。

**用户验收方式**:看"设计图和当前现状放在一起"的并排图(即 compare*.png),
逐部位对眼判断。量化指标是辅助(身体暗像素 ≥ 参考 0.8×、边缘密度 ≥ 0.8×、
最大纯黑块 ≤0.5%;头/眼特写 ≤2% 已放宽)。最终标准 = 用户满意,不是指标过线。

## 7. 建议的接手工序

1. 通读 `job-description.md`(尤其全部纠正记录,都是带数字的硬约束)和 `checklist-mantis.md`;
2. 先出一轮"现状体检":渲染 still + 三特写,用 sheet.mjs 与五张设计图并排,逐条写差距清单;
3. 逐部位修改 `web/mantis.js`(建议顺序:头 → 天线 → 前臂股节 → 腿的粗细 → 腹部细节);
   每改一个部位就出对比图自检,不要攒大招;
4. 交付 `rounds/rN/`(格式见 §4),score.md 里按 checklist 12 条打分(是/部分/否)+ 与设计图的具体差距;
5. **修改集中于 web/mantis.js;机位/曝光在 web/main.js**(特写机位参数在 main.js 的 SHOTS,
   hero 是自动取景)。注意 job-description 的"机位对齐先于形状对齐"——比较形状前先把机位和参考图一致;
6. 影片相关(landscape.json 等)本阶段不动;建模有大改后记得腹部拆解的子件(环/板/模块)
   都是按腹部表面参数化生成的,rx/rz/prof 改动会自动带动它们,但拆解动画的位移量
   (mantis.js 尾部 ABD 常量)可能需要复核。

## 8. 用户原话(便于把握态度)

- "目前我们这个版本只能说完成了一个草稿版本,因为目前的建模跟我们设计图里面的建模差别还是比较大的,
  很多细节对应不起来,比如头部的形状,头上两根犄角弯曲的方向,肚子这里我们做的直径明显有点纤细。"
- "你看这个头部差别还是好大……这个已经好几版了一直没有做出我满意的效果。"
- "做的不好这一版作废,给我把我给你的任务总结一下……我要让 codex 接手调整一下建模。"

结论:**当前目标是把建模(尤其头部)对齐五张设计图,做出用户点头的对比图;不着急做视频。**
