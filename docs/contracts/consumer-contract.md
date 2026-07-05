# Personal OS Consumer Contract

## 文档目标

本文定义 `personal-os` consumer 的职责边界，避免事件分发被误用成自动业务决策。

`personal-os` 的 consumer 负责把事件写成下游草稿、候选或待确认材料；最终判断、业务流转和高风险动作仍由对应系统或用户确认。

## Consumer 总原则

- consumer 只能根据 `signals` 生成下游草稿、候选或事件。
- consumer 不应直接执行高风险动作。
- consumer 不应调用 AI。
- consumer 不应覆盖下游系统的人工确认机制。
- consumer 写入下游时应尽量使用 draft、candidate、needs_review 等状态。
- consumer 应保持幂等，避免同一事件重复写入。
- checkpoint 只记录消费状态，不代表下游业务已经确认。

## 当前 consumers

当前 dispatch consumer 来自 `scripts/dispatch-event.ts` 和 `scripts/consumers/`。

### ai-method-consumer

文件：`scripts/consumers/ai-method-consumer.ts`

触发条件：

- `methodCandidate`
- `toolIdea`
- `promptCandidate`
- `workflowCandidate`

写入机制：

- 写入 ai-os `inbox/method-candidates/`，作为普通候选入口。
- 对中等价值、低风险候选生成 `inbox/method-drafts/` 草稿。
- 对高风险候选写入 `inbox/review-queue/`，等待人工确认。

当前分类命名：

- `auto_log`
- `auto_draft`
- `needs_review`
- `auto_promote_candidate`

边界：

- 不直接写入 ai-os 正式 `docs/playbooks/`。
- 不把个人原文扩写成公开 Skill。
- 不绕过 review queue。

### energy-consumer

文件：`scripts/consumers/energy-consumer.ts`

触发条件：

- `energyImpact !== 0`
- 或 `emotion.length > 0`

写入机制：

- 写入 energy-os 的 energy event 数据文件。
- 记录来源事件、能量影响、情绪、分类和简短触发描述。

边界：

- 只作为下游状态数据落点。
- 不扩展 energy-os。
- 不做能量分析报告。
- 不替用户做健康、医学或生活决策。

### career-consumer

文件：`scripts/consumers/career-consumer.ts`

触发条件：

- `careerRelated`

写入机制：

- 写入 `personal-os/content/career/job-search-log.md`。
- 只沉淀求职相关信号摘要、来源事件和下一步提示。

边界：

- 不自动投递。
- 不自动联系 HR。
- 不替 OfferFlow 做机会决策。
- 不把个人职业判断写成公开文档。

### OfferFlow / JD draft bridge

相关脚本：

- `scripts/import-jd-screenshot.ts`
- `scripts/parse-jd-image.ts`
- `scripts/push-to-offerflow.ts`

触发入口：

- `inbox/job-screenshots/pending/` 的 JD 图片、文本或 sidecar。

写入机制：

- 生成 JD import draft。
- 写入 `personal-os/content/job-intake/`。
- 追加写入 OfferFlow import inbox。
- 生成 `jd.import.created` 事件。

当前状态命名：

- `importStatus: "draft"`
- `needHumanReview: true | false`

边界：

- personal-os 只生成 imported draft。
- OfferFlow 才负责后续 parser、pending review、机会分析和业务流转。
- personal-os 不直接判断主攻、跟进、止损，也不绕过 OfferFlow 的人工确认。

## ai-os consumer 边界

`personal-os` 可以把 `methodCandidate`、`promptCandidate`、`workflowCandidate` 写入 ai-os 的 inbox、method drafts 或 review queue。

但是：

- 不能把真实隐私正文扩写成对外 Skill。
- 不能把 diary / events / job-intake / review-queue 原文复制到 ai-os 正式文档。
- ai-os 后续只沉淀脱敏方法、字段级说明和合成样例。
- 正式 Skill、Playbook、Workflow 需要人工 review 后再进入 docs。

## OfferFlow consumer / JD draft 边界

`personal-os` 可以把 JD draft / job intake 写到 OfferFlow import inbox。

OfferFlow 负责：

- JD 业务分析。
- parser。
- pending review。
- deriveDecision。
- 后续机会流转。

`personal-os` 不负责：

- 自动投递。
- 自动打招呼。
- 自动修改机会状态。
- 自动确认主攻 / 跟进 / 止损。
- 绕过 OfferFlow pending review。

## energy-os consumer 边界

energy-os 当前只是下游状态数据落点。`personal-os` 可以写 energy event，但今天不扩展 energy-os。

consumer 写入 energy-os 时只能表达事件信号，不应生成健康建议、行动建议或自动化任务。

## Consumer 状态建议

优先使用当前已有的低风险状态：

- `auto_log`
- `auto_draft`
- `needs_review`
- `auto_promote_candidate`
- `draft`
- `needHumanReview`

如果下游系统存在 `pending_review`，应由下游系统在自身流程中转换和确认，`personal-os` 不应绕过该阶段。

## 禁止事项

- 不把 AI 建议变成自动动作。
- 不自动联系 HR。
- 不自动投递。
- 不把个人原文写入公开文档。
- 不在 consumer 中绕过 OfferFlow pending review。
- 不让 consumer 直接修改下游正式规则、正式机会或正式结论。
