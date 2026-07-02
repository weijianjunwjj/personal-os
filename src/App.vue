<template>
  <main class="shell">
    <section class="intro">
      <p class="eyebrow">local first automation hub</p>
      <h1>Personal OS</h1>
      <p class="subtitle">个人数据中枢 + 本地事件 daemon。</p>
    </section>

    <section class="dashboard" aria-label="Personal OS controls">
      <article class="panel">
        <h2>日记入口</h2>
        <dl>
          <div>
            <dt>命令</dt>
            <dd><code>pnpm add:diary "..."</code></dd>
          </div>
          <div>
            <dt>文件入口</dt>
            <dd><code>inbox/diary/raw/</code></dd>
          </div>
        </dl>
      </article>

      <article class="panel">
        <h2>事件流</h2>
        <dl>
          <div>
            <dt>目录</dt>
            <dd><code>content/events/</code></dd>
          </div>
          <div>
            <dt>执行一次</dt>
            <dd><code>pnpm os:run</code></dd>
          </div>
          <div>
            <dt>常驻</dt>
            <dd><code>pnpm os:watch</code></dd>
          </div>
        </dl>
      </article>

      <article class="panel">
        <h2>本地 daemon</h2>
        <dl>
          <div>
            <dt>开机安装</dt>
            <dd><code>pnpm daemon:install</code></dd>
          </div>
          <div>
            <dt>卸载</dt>
            <dd><code>pnpm daemon:uninstall</code></dd>
          </div>
          <div>
            <dt>日志</dt>
            <dd><code>logs/daemon.log</code></dd>
          </div>
        </dl>
      </article>

      <article class="panel">
        <h2>JD 截图导入</h2>
        <dl>
          <div>
            <dt>入口</dt>
            <dd><code>inbox/job-screenshots/pending/</code></dd>
          </div>
          <div>
            <dt>输出</dt>
            <dd><code>OfferFlow import/inbox/jd-import-drafts.jsonl</code></dd>
          </div>
        </dl>
      </article>

      <article class="panel panel-wide">
        <h2>外部系统</h2>
        <ul class="systems">
          <li><strong>ai-os</strong><span>AI 协作知识库</span></li>
          <li><strong>energy-os</strong><span>能量事件数据</span></li>
          <li><strong>OfferFlow</strong><span>机会 draft inbox</span></li>
        </ul>
      </article>
    </section>
  </main>
</template>
