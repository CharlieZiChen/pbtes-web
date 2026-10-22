# PBTES · 数据库与研究比较

本目录为静态数据网页，区别于远程计算管理页 `pbtes_manager`。打开
`index.html#library` 浏览阶段，打开 `index.html#research` 进行研究比较。
网页不启动 Fluent，也不修改材料或计算结果。

线上入口：[GitHub Pages 数据网页](https://charliezichen.github.io/pbtes-web/)，
[研究分析](https://charliezichen.github.io/pbtes-web/#research)。

## 数据范围

`2026-10 重测数据` 为独立批次：1 组开环、9 组闭环，包含 10 个充热阶段和
9 个放热阶段。`UA100_M100` 放热缺失；有记录不表示计算已完成。
旧批次保留，可在数据库的数据集选择器中切换。

新批次保留全部报告采样；历史记录可能为 120 点降采样。
三维演示的温度分布是示意场，边界读数来自报告，不能当作真实 CFD 云图。

## 研究比较

研究页提供同 UA 下二次侧流量比较、同二次侧流量下 UA 比较、开环与闭环比较，
共 14 个比较组。支持共同窗口、全部记录、自定义窗口及充热等床层吸热量横轴。
UA 和二次侧流量属于外置 UDF 换热器，床层一次侧流量约 40 kg/h。

- PCM：12 个命名内部测点、测点均值与范围、标准差、极差及探针热图。
- 边界：床层及二次侧温度、带符号热功率与累计热量、平均功率、温度项热㶲。
- 放热交付：出口温度阈值可选，区分正向有效供热与带符号净交付量。
- 过程配对：按放热文件内的充热历史和切换点形成 9 个报告历史配对，展示来源及缺口。
- 导出：当前比较 CSV 与单图 SVG。命令行另生成完整指标及方法文件。

“原始 PCM 测点”默认将 12 个通道分别绘图，横纵轴范围统一，显示该工况的全部有效记录，
独立于上方的 240 min 共同窗口或等吸热量横轴。可选单个测点、叠加曲线，
也可主动切换为跟随比较窗口。通道颜色及线型在切换时保持固定。
专用“全部原始测点 CSV”导出所选通道的完整原始采样、步号、物理时间与缺口标志；
图09的 SVG 则导出当前查看范围，附窗口、公式及原始通道名。

每张数据图下方提供常显的计算公式，可展开变量、单位与适用边界。
温度来自 Fluent 报告，不由网页重构；热量、㶲和诊断公式按对应算法分别说明。
历史批次沿用原算法并标明其限制，不自动视作按重测口径重新积分。

PCM 统计是测点算术统计，不是全域温度、液相率、焓或 SOC。
积分不跨缺失步，不补未记录的起始区间，不外推终点。
充热默认共同窗口截至 240 min，放热使用共同有效历时；全程指标因时长不同不能直接排名。
配对尚未由 case/data 继承核验，不能据此计算完整周期效率。
壁损、辅机耗功和 PCM 全域储㶲不进入主指标。

## 本地更新和核验

在项目根目录使用已安装 NumPy 的 Python：

```powershell
python -X utf8 pbtes.py export-web
python -X utf8 pbtes.py research
python -X utf8 tools/verify_research_comparison.py
node tools/test_retest_web.cjs
node tools/test_research_web.cjs
node tools/test_probe_viewer.cjs
node tools/test_formula_catalog.cjs
```

`export-web` 生成 `library.js`；`research` 将 CSV、公式和方法文件写入
`data_library/research/retest-2026-10/`，该目录另附人工审阅的 `研究比较说明.md`。原始报告、原有 analysis、index、cycles 和
已保存的比较文件不由研究计算重写。网页可通过本地 HTTP 静态服务打开，
也可直接打开文件用于离线查看。

## 发布到 GitHub Pages

```powershell
python -X utf8 pbtes.py publish --dry-run
python -X utf8 pbtes.py publish
```

发布到 `CharlieZiChen/pbtes-web` 的仅为静态网页资产；不包含远程管理页样例、
Fluent 原始报告或 case/data。公开 `library.js` 副本去除来源主机名和本机绝对目录，
保留参数、曲线、报告相对路径和校验值；本地数据文件不变。脚本为资源添加内容版本号。
