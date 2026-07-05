# Personal OS Event Contract

## 文档目标

`personal-os` 的核心职责是把本地输入转成可分发事件。它不负责最终业务决策，不直接调用 AI，不替代 OfferFlow，也不替代 ai-os。

它只负责：

- 捕捉输入
- 提取信号
- 生成事件
- 分发到 consumer
- 保留必要 checkpoint

## 事件输入来源

事件输入只描述机制，不沉淀真实正文：

- diary raw text：来自命令行或 `inbox/diary/raw/` 的日记输入。
- JD / job intake material：来自 `inbox/job-screenshots/pending/` 的 JD 图片、文本或 sidecar。
- method insight：可沉淀为方法、规则或判断的输入。
- workflow candidate：可沉淀为流程、机制或工作流的输入。
- prompt candidate：可沉淀为提示词、模板或规则的输入。
- energy-related note：包含情绪、能量、压力、恢复或里程碑信号的输入。

真实 `rawText` 属于个人数据，不应出现在对外文档、Skill 文档或公开 case 中。对外沉淀只允许写字段说明、脱敏摘要或合成样例。

## OsEvent 标准字段

当前事件类型来自 `scripts/emit-event.ts`：

```ts
interface OsEvent {
  id: string
  time: string
  type: 'diary.entry.created' | 'jd.import.created'
  sourceSystem: 'personal-os'
  sourcePath: string
  rawText: string
  topics: string[]
  signals: EventSignals
}
```

字段说明：

- `id`：事件唯一标识。
- `time`：事件生成时间，使用 ISO 字符串。
- `type`：事件类型，目前包括 `diary.entry.created` 和 `jd.import.created`。
- `sourceSystem`：来源系统，目前固定为 `personal-os`。
- `sourcePath`：来源文件路径或逻辑来源。
- `rawText`：原始输入文本。默认视为敏感个人内容。
- `topics`：事件主题，例如 `energy`、`career`、`method`、`startup`、`jd-import`。
- `signals`：由 `buildSignals` 或 JD 导入逻辑生成的结构化信号。

当前代码没有独立的 `timestamp`、`createdAt`、`source` 或 `summary` 字段；如需摘要，应在下游文档中用脱敏摘要或合成描述表达，不应复制 `rawText`。

## EventSignals 标准字段

当前信号类型来自 `scripts/emit-event.ts`：

```ts
interface EventSignals {
  emotion: string[]
  energyImpact: number
  careerRelated: boolean
  startupRelated: boolean
  methodCandidate: boolean
  toolIdea: boolean
  promptCandidate: boolean
  workflowCandidate: boolean
  reviewNeeded: boolean
}
```

字段说明：

- `emotion`：从输入中提取的情绪或状态词。
- `energyImpact`：能量影响，当前用 `-1`、`0`、`1` 表示负向、中性、正向。
- `careerRelated`：是否与求职、岗位、简历、HR、投递等主题相关。
- `startupRelated`：是否与产品、客户、体验单、转化等创业主题相关。
- `methodCandidate`：是否包含可沉淀为方法、规则或判断的信号。
- `toolIdea`：是否包含工具化、自动化、联动或系统机制想法。
- `promptCandidate`：是否包含提示词、模板或规则候选。
- `workflowCandidate`：是否包含流程、工作流或机制候选。
- `reviewNeeded`：是否需要后续人工 review。当前日记事件通常在出现情绪或求职信号时标记，JD 导入事件默认需要 review。

当前代码没有独立的 `energyRelated` 字段。能量相关判断由 `energyImpact !== 0` 或 `emotion.length > 0` 表达。

## 隐私边界

- `rawText` 默认是敏感个人内容。
- 对外沉淀只允许写 summary、synthetic example 或 field-level description。
- 不允许把 diary、events、job-intake、review-queue 原文复制到 ai-os。
- 不允许把个人状态、具体公司岗位、薪资策略等原文写入公开文档。
- 不允许把真实 Boss/JD 截图内容、简历正文、诊断报告正文作为公开样例。
- 所有文档示例必须使用合成样例。

## 合成事件示例

合成输入：

```txt
今天看到一个 AI 前端岗位，想判断是否值得沟通。
```

脱敏 `OsEvent` 示例：

```json
{
  "id": "evt_20260705_120000_synthetic",
  "time": "2026-07-05T12:00:00.000Z",
  "type": "diary.entry.created",
  "sourceSystem": "personal-os",
  "sourcePath": "synthetic/demo-note.md",
  "rawText": "今天看到一个 AI 前端岗位，想判断是否值得沟通。",
  "topics": ["career"],
  "signals": {
    "emotion": [],
    "energyImpact": 0,
    "careerRelated": true,
    "startupRelated": false,
    "methodCandidate": false,
    "toolIdea": false,
    "promptCandidate": false,
    "workflowCandidate": false,
    "reviewNeeded": true
  }
}
```

这个示例是合成数据，不来自真实日记、真实 events、真实 job-intake 或真实 review-queue。

## 事件生命周期

```txt
input
  -> buildSignals
  -> emit OsEvent
  -> dispatchEvent
  -> consumer
  -> downstream artifact
```

生命周期说明：

1. 输入进入 `personal-os`，例如日记文本或 JD intake。
2. `buildSignals` 根据关键词和规则生成 `EventSignals`。
3. `emit-event` 写入 `OsEvent`。
4. `dispatch-event` 根据 signals 选择 consumer。
5. consumer 写入下游 artifact，例如 ai-os candidate、energy-os event 或 career log。
6. checkpoint 记录 consumer 已处理的事件 id，避免重复消费。

## 不做事项

- 不做 AI 调用。
- 不做自动投递。
- 不做自动打招呼。
- 不做 OfferFlow 决策。
- 不做 energy-os 分析。
- 不做总控大屏。
