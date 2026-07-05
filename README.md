# Personal OS / 个人 OS

个人 OS 是我的个人生产力系统总控制台，用于统一入口管理多个垂直 OS：

- OfferFlow：求职 OS
- Energy OS：能量 OS
- ai-code-rules：AI 协作规则内核

当前版本优先作为系统入口与项目导航台，不急于接入复杂微前端。

## 当前定位

`personal-os` 当前定位为本地事件入口 / workflow bus。它捕捉 diary、JD、method insight 等本地输入，通过 `OsEvent` / `EventSignals` 提取信号并分发到下游系统。

- `ai-os` 是方法沉淀层，接收 method / prompt / workflow candidates。
- OfferFlow 是求职 workflow 业务闭环，接收 JD draft 后再进行人工确认和后续流转。
- `energy-os` 当前只是状态事件落点。

当前阶段不做复杂 Dashboard，不做新的主应用，不接 AI API。
